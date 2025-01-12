declare global {
  export interface WebSocketStreamOptions {
    signal?: AbortSignal | undefined;
  }

  export interface WebSocketStreamOpenEvent {
    extensions: string;
    protocol: string;
    readable: ReadableStream<Uint8Array | string>;
    writable: WritableStream<ArrayBuffer | ArrayBufferView | string>;
  }

  export interface WebSocketStreamCloseEvent {
    closeCode: number;
    reason: string;
  }

  export interface WebSocketStreamCloseOptions {
    closeCode: number;
    reason: string;
  }

  export declare class WebSocketStream {
    constructor(url: string, options?: WebSocketStreamOptions);

    url: string;
    opened: Promise<WebSocketStreamOpenEvent>;
    closed: Promise<WebSocketStreamCloseEvent>;

    close(options?: WebSocketStreamCloseOptions): void;
  }
}

export {}
