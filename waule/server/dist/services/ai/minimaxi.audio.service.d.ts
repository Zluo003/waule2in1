interface VoiceSetting {
    voice_id?: string;
    speed?: number;
    vol?: number;
    pitch?: number;
    emotion?: string;
}
interface AudioSetting {
    sample_rate?: number;
    bitrate?: number;
    format?: 'mp3' | 'wav';
    channel?: 1 | 2;
}
export declare function synthesizeSync(options: {
    model: string;
    text: string;
    voice?: VoiceSetting;
    audio?: AudioSetting;
    apiKey?: string;
    apiUrl?: string;
    stream?: boolean;
    subtitle_enable?: boolean;
    language_boost?: string | null;
    pronunciation_dict?: any;
    timber_weights?: any[];
    voice_modify?: any;
    output_format?: 'hex' | 'url';
    aigc_watermark?: boolean;
}): Promise<string>;
export declare function createT2AAsync(options: {
    model: string;
    text?: string;
    text_file_id?: string;
    voice?: VoiceSetting;
    audio?: AudioSetting;
    apiKey?: string;
    apiUrl?: string;
}): Promise<string>;
export declare function queryT2AAsync(options: {
    taskId: string;
    apiKey?: string;
    apiUrl?: string;
}): Promise<{
    status: string;
    fileId?: string;
}>;
export declare function uploadFile(options: {
    filePath: string;
    purpose: string;
    apiKey?: string;
    apiUrl?: string;
    filename?: string;
    contentType?: string;
}): Promise<string>;
export declare function voiceClone(options: {
    clone_file_id: string;
    voice_id: string;
    prompt_audio_file_id?: string;
    prompt_text?: string;
    model?: string;
    text?: string;
    need_noise_reduction?: boolean;
    need_volume_normalization?: boolean;
    aigc_watermark?: boolean;
    apiKey?: string;
    apiUrl?: string;
}): Promise<{
    voiceId: string;
    sampleFileId?: string;
}>;
export declare function voiceDesign(options: {
    prompt: string;
    preview_text?: string;
    voice_id?: string;
    aigc_watermark?: boolean;
    apiKey?: string;
    apiUrl?: string;
}): Promise<{
    voiceId: string;
    requestId?: string;
    hex?: string;
}>;
export declare function listVoices(options: {
    apiKey?: string;
    apiUrl?: string;
}): Promise<Array<{
    voiceId: string;
}>>;
export declare function deleteVoice(options: {
    voiceId: string;
    apiKey?: string;
    apiUrl?: string;
}): Promise<boolean>;
export declare function downloadT2AAsync(options: {
    fileId: string;
    apiKey?: string;
    apiUrl?: string;
}): Promise<string>;
export declare function listFiles(options: {
    apiKey?: string;
    apiUrl?: string;
    purpose?: string;
    limit?: number;
}): Promise<Array<{
    file_id: string;
    purpose?: string;
    created_at?: number;
    filename?: string;
    bytes?: number;
}>>;
declare const _default: {
    synthesizeSync: typeof synthesizeSync;
    createT2AAsync: typeof createT2AAsync;
    queryT2AAsync: typeof queryT2AAsync;
    downloadT2AAsync: typeof downloadT2AAsync;
    uploadFile: typeof uploadFile;
    voiceClone: typeof voiceClone;
    voiceDesign: typeof voiceDesign;
    listVoices: typeof listVoices;
    deleteVoice: typeof deleteVoice;
};
export default _default;
//# sourceMappingURL=minimaxi.audio.service.d.ts.map