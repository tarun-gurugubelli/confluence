export type NodeType = 'space' | 'folder' | 'page';

export interface TreeNodeModel {
  id: string;
  type: NodeType;
  title: string;
  space_id?: string | null;
  space_key?: string | null;
  parent_id?: string | null;
  children: TreeNodeModel[];
}

export interface SpaceSummary {
  id: string;
  key: string;
  name: string;
  type?: string | null;
  homepage_id?: string | null;
}

export interface PageDetail {
  id: string;
  title: string;
  space_id?: string | null;
  body_html: string;
  version?: number | null;
  parent_id?: string | null;
}

export interface CreatedResponse {
  id: string;
  type: NodeType;
  title: string;
}

export interface ConfigStatus {
  configured: boolean;
}
