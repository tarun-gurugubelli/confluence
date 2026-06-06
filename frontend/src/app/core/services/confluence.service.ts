import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ConfigStatus,
  CreatedResponse,
  PageDetail,
  SpaceSummary,
  TreeNodeModel,
} from '../models/models';

const API = environment.apiBase;

@Injectable({ providedIn: 'root' })
export class ConfluenceService {
  private http = inject(HttpClient);

  getConfig(): Observable<ConfigStatus> {
    return this.http.get<ConfigStatus>(`${API}/config`);
  }

  listSpaces(): Observable<SpaceSummary[]> {
    return this.http.get<SpaceSummary[]>(`${API}/spaces`);
  }

  getSpaceTree(spaceId: string): Observable<TreeNodeModel> {
    return this.http.get<TreeNodeModel>(`${API}/spaces/${encodeURIComponent(spaceId)}/tree`);
  }

  getPage(pageId: string): Observable<PageDetail> {
    return this.http.get<PageDetail>(`${API}/pages/${encodeURIComponent(pageId)}`);
  }

  createSpace(
    password: string,
    body: { key: string; name: string; description?: string },
  ): Observable<CreatedResponse> {
    return this.http.post<CreatedResponse>(`${API}/spaces`, body, {
      headers: this.authHeaders(password),
    });
  }

  createFolder(
    password: string,
    body: { space_id: string; title: string; parent_id?: string | null },
  ): Observable<CreatedResponse> {
    return this.http.post<CreatedResponse>(`${API}/folders`, body, {
      headers: this.authHeaders(password),
    });
  }

  createPage(
    password: string,
    body: { space_id: string; title: string; body_html: string; parent_id?: string | null },
  ): Observable<CreatedResponse> {
    return this.http.post<CreatedResponse>(`${API}/pages`, body, {
      headers: this.authHeaders(password),
    });
  }

  verifyPassword(password: string): Observable<{ valid: boolean }> {
    return this.http.post<{ valid: boolean }>(`${API}/auth/verify`, { password });
  }

  private authHeaders(password: string): HttpHeaders {
    return new HttpHeaders({ 'X-Registration-Password': password });
  }
}
