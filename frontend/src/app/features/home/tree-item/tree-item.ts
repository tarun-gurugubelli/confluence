import { Component, computed, input, output, signal } from '@angular/core';

import { TreeNodeModel } from '../../../core/models/models';

@Component({
  selector: 'app-tree-item',
  imports: [],
  templateUrl: './tree-item.html',
  styleUrl: './tree-item.css',
})
export class TreeItem {
  node = input.required<TreeNodeModel>();
  selectedId = input<string | null>(null);
  depth = input<number>(0);

  selectPage = output<TreeNodeModel>();

  expanded = signal(true);

  isSelected = computed(
    () => this.selectedId() != null && this.selectedId() === this.node().id,
  );
  hasChildren = computed(() => this.node().children.length > 0);

  onClick(): void {
    const n = this.node();
    if (n.type === 'page') {
      this.selectPage.emit(n);
    } else {
      this.expanded.update((v) => !v);
    }
  }

  bubble(node: TreeNodeModel): void {
    this.selectPage.emit(node);
  }
}
