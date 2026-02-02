declare module 'react-native-zeroconf' {
  export interface ZeroconfService {
    name: string;
    type: string;
    host: string;
    port: number;
    addresses?: string[];
    txt?: Record<string, string>;
  }

  export default class Zeroconf {
    scan(type?: string, protocol?: string, domain?: string): void;
    stop(): void;
    publishService(
      type: string,
      protocol: string,
      name: string,
      port: number,
      txt?: Record<string, string>
    ): void;
    unpublishService(name: string): void;
    on(event: 'start', callback: () => void): void;
    on(event: 'stop', callback: () => void): void;
    on(event: 'found', callback: (serviceName: string) => void): void;
    on(event: 'resolved', callback: (service: ZeroconfService) => void): void;
    on(event: 'remove', callback: (serviceName: string) => void): void;
    on(event: 'update', callback: () => void): void;
    on(event: 'error', callback: (error: Error) => void): void;
    removeAllListeners(): void;
  }
}
