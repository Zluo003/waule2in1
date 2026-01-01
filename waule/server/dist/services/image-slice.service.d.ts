interface SliceResult {
    urls: string[];
    width: number;
    height: number;
}
declare class ImageSliceService {
    /**
     * 切割图片为网格
     * @param imageUrl 图片 URL
     * @param rows 行数
     * @param cols 列数
     * @returns 切割后的图片 URL 列表
     */
    sliceImageGrid(imageUrl: string, rows: number, cols: number): Promise<SliceResult>;
}
export declare const imageSliceService: ImageSliceService;
export {};
//# sourceMappingURL=image-slice.service.d.ts.map