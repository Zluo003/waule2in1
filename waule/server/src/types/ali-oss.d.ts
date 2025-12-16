declare module 'ali-oss' {
  export interface OSSOptions {
    region: string;
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
  }

  export default class OSS {
    constructor(options: OSSOptions);
    put(objectKey: string, file: string | Buffer, options?: any): Promise<any>;
    options: OSSOptions;
  }
}