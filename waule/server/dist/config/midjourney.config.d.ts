export declare const midjourneyConfig: {
    mode: "proxy" | "discord";
    enableDiscord: boolean;
    proxyUrl: string;
    apiSecret: string;
    discord: {
        userToken: string;
        guildId: string;
        channelId: string;
    };
    pollInterval: number;
    maxPollAttempts: number;
    timeout: number;
};
export declare const MIDJOURNEY_TASK_STATUS: {
    readonly SUBMITTED: "SUBMITTED";
    readonly IN_PROGRESS: "IN_PROGRESS";
    readonly SUCCESS: "SUCCESS";
    readonly FAILURE: "FAILURE";
    readonly NOT_FOUND: "NOT_FOUND";
};
export type MidjourneyTaskStatus = typeof MIDJOURNEY_TASK_STATUS[keyof typeof MIDJOURNEY_TASK_STATUS];
//# sourceMappingURL=midjourney.config.d.ts.map