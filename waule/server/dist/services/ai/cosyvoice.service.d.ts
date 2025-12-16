interface CreateVoiceOptions {
    targetModel: string;
    prefix: string;
    url: string;
    apiKey?: string;
    apiUrl?: string;
}
interface QueryVoiceOptions {
    voiceId: string;
    apiKey?: string;
    apiUrl?: string;
}
interface SynthesizeOptions {
    model: string;
    voice: string;
    text: string;
    format?: 'mp3' | 'wav';
    sampleRate?: number;
    volume?: number;
    rate?: number;
    pitch?: number;
    apiKey?: string;
    apiUrl?: string;
}
export declare function createVoice(options: CreateVoiceOptions): Promise<{
    voiceId: string;
    requestId?: string;
}>;
export declare function queryVoice(options: QueryVoiceOptions): Promise<{
    status: string;
    requestId?: string;
}>;
export declare function synthesize(options: SynthesizeOptions): Promise<string>;
declare const _default: {
    createVoice: typeof createVoice;
    queryVoice: typeof queryVoice;
    synthesize: typeof synthesize;
};
export default _default;
//# sourceMappingURL=cosyvoice.service.d.ts.map