import axios, { AxiosRequestConfig } from 'axios';

export async function httpRequest<T = any>(config: AxiosRequestConfig): Promise<T> {
  const response = await axios(config);
  return response.data;
}

export async function downloadBuffer(url: string): Promise<Buffer> {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(response.data);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
