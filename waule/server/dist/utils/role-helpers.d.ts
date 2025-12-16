/**
 * 角色图片组接口
 */
export interface RoleImages {
    faceAssetId?: string | null;
    frontAssetId?: string | null;
    sideAssetId?: string | null;
    backAssetId?: string | null;
}
/**
 * 角色元数据接口
 */
export interface RoleMetadata {
    kind: 'ROLE';
    name: string;
    images: RoleImages;
    voiceAssetId?: string | null;
    documentAssetId?: string | null;
}
/**
 * Vidu API Subjects 参数接口
 */
export interface ViduSubject {
    id: string;
    images: string[];
    voice_id?: string;
}
/**
 * 从角色资产获取图片URL列表
 * @param roleMetadata 角色元数据
 * @param userId 用户ID
 * @returns 图片URL数组（最多3张，按优先级：face > front > side）
 */
export declare function getRoleImageUrls(roleMetadata: RoleMetadata, userId: string): Promise<string[]>;
/**
 * 将角色资产转换为 Vidu Subjects 格式
 * @param roles 角色资产数组
 * @param userId 用户ID
 * @returns Vidu Subjects 数组
 */
export declare function convertRolesToSubjects(roles: Array<{
    id: string;
    metadata: any;
    name: string;
}>, userId: string): Promise<ViduSubject[]>;
/**
 * 从角色ID数组获取 Vidu Subjects
 * @param roleIds 角色资产ID数组
 * @param userId 用户ID
 * @returns Vidu Subjects 数组
 */
export declare function getSubjectsFromRoleIds(roleIds: string[], userId: string): Promise<ViduSubject[]>;
//# sourceMappingURL=role-helpers.d.ts.map