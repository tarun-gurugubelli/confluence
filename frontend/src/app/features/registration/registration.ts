import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { SpaceSummary, TreeNodeModel } from '../../core/models/models';
import { AuthService } from '../../core/services/auth.service';
import { ConfluenceService } from '../../core/services/confluence.service';

interface ParentOption {
  id: string;
  label: string;
  type: 'folder' | 'page';
}

interface FormMessage {
  kind: 'success' | 'error';
  text: string;
}

@Component({
  selector: 'app-registration',
  imports: [FormsModule],
  templateUrl: './registration.html',
  styleUrl: './registration.css',
})
export class Registration implements OnInit {
  private api = inject(ConfluenceService);
  protected auth = inject(AuthService);

  // Password gate
  passwordInput = '';
  passwordError = signal<string | null>(null);
  verifying = signal(false);

  // Reference data
  spaces = signal<SpaceSummary[]>([]);
  treesBySpace = signal<Record<string, TreeNodeModel>>({});
  backendConfigured = signal(true);

  // Create space form
  spaceForm = { key: '', name: '', description: '' };
  spaceMessage = signal<FormMessage | null>(null);
  creatingSpace = signal(false);

  // Create folder form
  folderForm = { space_id: '', parent_id: '', title: '' };
  folderMessage = signal<FormMessage | null>(null);
  creatingFolder = signal(false);
  folderParentOptions = computed(() => this.parentOptionsFor(this.folderForm.space_id));

  // Create page form
  pageForm = { space_id: '', parent_id: '', title: '', body_html: '' };
  pageMessage = signal<FormMessage | null>(null);
  creatingPage = signal(false);
  pageParentOptions = computed(() => this.parentOptionsFor(this.pageForm.space_id));

  ngOnInit(): void {
    if (this.auth.isAuthed()) {
      this.loadReferenceData();
    }
  }

  // ----- Password gate ------------------------------------------------
  submitPassword(): void {
    if (!this.passwordInput) {
      this.passwordError.set('Password is required.');
      return;
    }
    this.verifying.set(true);
    this.passwordError.set(null);
    this.api.verifyPassword(this.passwordInput).subscribe({
      next: (resp) => {
        this.verifying.set(false);
        if (resp.valid) {
          this.auth.setPassword(this.passwordInput);
          this.passwordInput = '';
          this.loadReferenceData();
        } else {
          this.passwordError.set('Incorrect password.');
        }
      },
      error: (err) => {
        this.verifying.set(false);
        this.passwordError.set(this.errorMessage(err));
      },
    });
  }

  logout(): void {
    this.auth.clear();
    this.spaceMessage.set(null);
    this.folderMessage.set(null);
    this.pageMessage.set(null);
  }

  // ----- Reference data ------------------------------------------------
  private loadReferenceData(): void {
    this.api.getConfig().subscribe({
      next: (c) => this.backendConfigured.set(c.configured),
      error: () => this.backendConfigured.set(true),
    });
    this.refreshSpaces();
  }

  private refreshSpaces(): void {
    this.api.listSpaces().subscribe({
      next: (spaces) => {
        this.spaces.set(spaces);
        spaces.forEach((s) => this.refreshTree(s.id));
      },
    });
  }

  private refreshTree(spaceId: string): void {
    this.api.getSpaceTree(spaceId).subscribe({
      next: (tree) => {
        this.treesBySpace.update((m) => ({ ...m, [spaceId]: tree }));
      },
    });
  }

  private parentOptionsFor(spaceId: string): ParentOption[] {
    if (!spaceId) return [];
    const tree = this.treesBySpace()[spaceId];
    if (!tree) return [];
    const out: ParentOption[] = [];
    const walk = (n: TreeNodeModel, depth: number) => {
      if (n.type !== 'space') {
        const prefix = '  '.repeat(depth);
        const label = `${prefix}${n.type === 'folder' ? '[folder]' : '[page]'} ${n.title}`;
        out.push({ id: n.id, label, type: n.type });
      }
      for (const c of n.children) walk(c, depth + (n.type === 'space' ? 0 : 1));
    };
    walk(tree, 0);
    return out;
  }

  // ----- Submit handlers ----------------------------------------------
  submitSpace(): void {
    const pw = this.auth.password();
    if (!pw) return;
    if (!this.spaceForm.key.trim() || !this.spaceForm.name.trim()) {
      this.spaceMessage.set({ kind: 'error', text: 'Key and name are required.' });
      return;
    }
    this.creatingSpace.set(true);
    this.spaceMessage.set(null);
    this.api
      .createSpace(pw, {
        key: this.spaceForm.key.trim(),
        name: this.spaceForm.name.trim(),
        description: this.spaceForm.description.trim() || undefined,
      })
      .subscribe({
        next: (r) => {
          this.creatingSpace.set(false);
          this.spaceMessage.set({
            kind: 'success',
            text: `Created space "${r.title}".`,
          });
          this.spaceForm = { key: '', name: '', description: '' };
          this.refreshSpaces();
        },
        error: (err) => this.handleCreateError(err, this.spaceMessage),
      });
  }

  submitFolder(): void {
    const pw = this.auth.password();
    if (!pw) return;
    if (!this.folderForm.space_id || !this.folderForm.title.trim()) {
      this.folderMessage.set({ kind: 'error', text: 'Space and title are required.' });
      return;
    }
    this.creatingFolder.set(true);
    this.folderMessage.set(null);
    this.api
      .createFolder(pw, {
        space_id: this.folderForm.space_id,
        title: this.folderForm.title.trim(),
        parent_id: this.folderForm.parent_id || null,
      })
      .subscribe({
        next: (r) => {
          this.creatingFolder.set(false);
          this.folderMessage.set({
            kind: 'success',
            text: `Created folder "${r.title}".`,
          });
          const spaceId = this.folderForm.space_id;
          this.folderForm = { space_id: spaceId, parent_id: '', title: '' };
          this.refreshTree(spaceId);
        },
        error: (err) => this.handleCreateError(err, this.folderMessage),
      });
  }

  submitPage(): void {
    const pw = this.auth.password();
    if (!pw) return;
    if (!this.pageForm.space_id || !this.pageForm.title.trim()) {
      this.pageMessage.set({ kind: 'error', text: 'Space and title are required.' });
      return;
    }
    this.creatingPage.set(true);
    this.pageMessage.set(null);
    this.api
      .createPage(pw, {
        space_id: this.pageForm.space_id,
        title: this.pageForm.title.trim(),
        body_html: this.pageForm.body_html,
        parent_id: this.pageForm.parent_id || null,
      })
      .subscribe({
        next: (r) => {
          this.creatingPage.set(false);
          this.pageMessage.set({
            kind: 'success',
            text: `Created page "${r.title}".`,
          });
          const spaceId = this.pageForm.space_id;
          this.pageForm = { space_id: spaceId, parent_id: '', title: '', body_html: '' };
          this.refreshTree(spaceId);
        },
        error: (err) => this.handleCreateError(err, this.pageMessage),
      });
  }

  private handleCreateError(
    err: unknown,
    sink: { set: (m: FormMessage | null) => void },
  ): void {
    this.creatingSpace.set(false);
    this.creatingFolder.set(false);
    this.creatingPage.set(false);
    if (err instanceof HttpErrorResponse && err.status === 401) {
      this.auth.clear();
      sink.set({
        kind: 'error',
        text: 'Authentication expired. Please re-enter the password.',
      });
      return;
    }
    sink.set({ kind: 'error', text: this.errorMessage(err) });
  }

  private errorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const detail = (err.error as { detail?: string } | null)?.detail;
      return detail ?? err.message;
    }
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Request failed.';
  }
}
