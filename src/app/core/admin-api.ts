import { HttpClient, httpResource } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API } from './api';
import {
  AdminUser,
  Dictionaries,
  ImportRecord,
  ImportResult,
  ImportType,
  NewUser,
  Right,
  Role,
  RolesState,
  SettingsChange,
} from './models';
import { RisksApi } from './risks-api';

export type AdminUserRow = AdminUser & { blockReason: string | null };

@Service()
export class AdminApi {
  private readonly http = inject(HttpClient);
  private readonly risks = inject(RisksApi);

  users(): Promise<AdminUserRow[]> {
    return firstValueFrom(this.http.get<AdminUserRow[]>(`${API}/admin/users`));
  }

  createUser(body: NewUser): Promise<AdminUser> {
    return firstValueFrom(this.http.post<AdminUser>(`${API}/admin/users`, body));
  }

  updateUser(id: string, patch: Partial<AdminUser>): Promise<AdminUser> {
    return firstValueFrom(this.http.patch<AdminUser>(`${API}/admin/users/${id}`, patch));
  }

  readonly roles = () => httpResource<RolesState>(() => `${API}/admin/roles`);

  saveRoles(
    matrix: Record<Role, Right[]>,
    active: Partial<Record<Role, boolean>>,
  ): Promise<RolesState> {
    return firstValueFrom(this.http.put<RolesState>(`${API}/admin/roles`, { matrix, active }));
  }

  /** Saves part of the reference data; the shared dictionaries resource reloads after it. */
  async updateDictionaries(
    patch: Partial<Dictionaries> & { recalc?: boolean },
  ): Promise<Dictionaries> {
    const d = await firstValueFrom(
      this.http.patch<Dictionaries>(`${API}/admin/dictionaries`, patch),
    );
    this.risks.dictionaries.reload();
    return d;
  }

  readonly changes = () => httpResource<SettingsChange[]>(() => `${API}/admin/changes`);
  readonly imports = () => httpResource<ImportRecord[]>(() => `${API}/admin/imports`);

  template(type: ImportType): Promise<string[]> {
    return firstValueFrom(
      this.http.get<string[]>(`${API}/admin/imports/template`, { params: { type } }),
    );
  }

  /** Imports may add assets and risks, so shared dictionaries reload afterwards. */
  async runImport(type: ImportType, file: string, rows: string[][]): Promise<ImportResult> {
    const result = await firstValueFrom(
      this.http.post<ImportResult>(`${API}/admin/imports`, { type, file, rows }),
    );
    this.risks.dictionaries.reload();
    return result;
  }
}
