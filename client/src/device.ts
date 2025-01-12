import {
  Adb,
  ADB_DAEMON_DEFAULT_FEATURES,
  AdbBanner,
  AdbReverseNotSupportedError,
  type AdbSocket,
  type AdbTransport,
} from "@yume-chan/adb";
import { MaybeConsumable, ReadableStream, TextDecoderStream, } from "@yume-chan/stream-extra";

class WebSocketTransport implements AdbTransport {
  serial: string;
  maxPayloadSize: number;
  banner: AdbBanner;

  #disconnected = Promise.withResolvers<void>();
  get disconnected() {
    return this.#disconnected.promise;
  }

  clientFeatures = ADB_DAEMON_DEFAULT_FEATURES;

  #sockets = new Set<WebSocketStream>();

  constructor(
    serial: string,
    maxPayloadSize: number,
    banner: AdbBanner,
  ) {
    this.serial = serial;
    this.maxPayloadSize = maxPayloadSize;
    this.banner = banner;
  }

  addReverseTunnel(): never {
    throw new AdbReverseNotSupportedError();
  }

  removeReverseTunnel(): never {
    throw new AdbReverseNotSupportedError();
  }

  clearReverseTunnels(): never {
    throw new AdbReverseNotSupportedError();
  }

  async connect(service: string): Promise<AdbSocket> {
    const socket = new WebSocketStream(
      `ws://localhost:8080/device/${this.serial}/${service}`
    );
    const open = await socket.opened;
    this.#sockets.add(socket);
    const writer = open.writable.getWriter();
    return {
      service,
      readable: open.readable.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          // Chrome's implementation still gives `ArrayBuffer`
          controller.enqueue(new Uint8Array(chunk));
        }
      })) as ReadableStream<Uint8Array>,
      writable: new MaybeConsumable.WritableStream({
        async write(chunk) {
          await writer.write(chunk);
        },
      }),
      close() {
        socket.close();
      },
      closed: socket.closed as never as Promise<void>,
    };
  }

  close() {
    for (const socket of this.#sockets) {
      socket.close();
    }
    this.#sockets.clear();
    this.#disconnected.resolve();
  }
}

(async () => {
  const container = document.getElementById("app")!;

  const params = new URLSearchParams(location.search);
  const serial = params.get("serial");
  if (!serial) {
    container.textContent = "Missing `serial` parameter";
    return;
  }

  const response = await fetch(`http://localhost:8080/device/${serial}`);
  if (!response.ok) {
    container.textContent = "Connect error: " + response.status;
    return;
  }

  const data = await response.json();
  const transport = new WebSocketTransport(
    serial,
    data.maxPayloadSize,
    new AdbBanner(data.product, data.model, data.device, data.features),
  );

  const adb = new Adb(transport);
  const process = await adb.subprocess.spawn('logcat');
  for await (const chunk of process.stdout.pipeThrough(new TextDecoderStream())) {
    container.textContent += chunk;
  }
})();
