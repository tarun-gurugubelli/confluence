import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { forkJoin } from 'rxjs';

import { PageDetail, SpaceSummary, TreeNodeModel } from '../../core/models/models';
import { ConfluenceService } from '../../core/services/confluence.service';
import { TreeItem } from './tree-item/tree-item';

@Component({
  selector: 'app-home',
  imports: [TreeItem],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  private api = inject(ConfluenceService);
  private sanitizer = inject(DomSanitizer);

  spaces = signal<SpaceSummary[]>([]);
  trees = signal<TreeNodeModel[]>([]);
  selectedPageId = signal<string | null>(null);
  pageDetail = signal<PageDetail | null>(null);
  backendConfigured = signal(true);

  loadingTree = signal(true);
  loadingPage = signal(false);
  treeError = signal<string | null>(null);
  pageError = signal<string | null>(null);

  // Controls the mobile slide-in sidebar. Ignored on md+ screens
  // where the sidebar is always visible.
  sidebarOpen = signal(false);

  safeBody = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.pageDetail()?.body_html ?? ''),
  );

  ngOnInit(): void {
    this.api.getConfig().subscribe({
      next: (c) => this.backendConfigured.set(c.configured),
      error: () => this.backendConfigured.set(true),
    });
    this.loadAll();
  }

  private loadAll(): void {
    this.loadingTree.set(true);
    this.treeError.set(null);
    this.api.listSpaces().subscribe({
      next: (spaces) => {
        this.spaces.set(spaces);
        if (spaces.length === 0) {
          this.trees.set([]);
          this.loadingTree.set(false);
          return;
        }
        forkJoin(spaces.map((s) => this.api.getSpaceTree(s.id))).subscribe({
          next: (trees) => {
            this.trees.set(trees);
            this.loadingTree.set(false);
          },
          error: (err) => {
            this.loadingTree.set(false);
            this.treeError.set(this.errorMessage(err));
          },
        });
      },
      error: (err) => {
        this.loadingTree.set(false);
        this.treeError.set(this.errorMessage(err));
      },
    });
  }

  onSelectPage(node: TreeNodeModel): void {
    if (node.type !== 'page') return;
    this.selectedPageId.set(node.id);
    this.sidebarOpen.set(false); // auto-close drawer on mobile after selection
    this.loadingPage.set(true);
    this.pageError.set(null);
    this.pageDetail.set(null);
    this.api.getPage(node.id).subscribe({
      next: (page) => {
        this.pageDetail.set(page);
        this.loadingPage.set(false);
      },
      error: (err) => {
        this.loadingPage.set(false);
        this.pageError.set(this.errorMessage(err));
      },
    });
  }

  reload(): void {
    this.loadAll();
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Request failed.';
  }
}
