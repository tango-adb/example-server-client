import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import {
  AdbDaemonWebUsbDeviceManager,
  type AdbDaemonWebUsbDevice,
} from "@yume-chan/adb-daemon-webusb";
import { delay } from "@yume-chan/async";
import { WritableStream } from "@yume-chan/stream-extra";
import { createServer } from "node:http";
import { WebUSB } from "usb";
import { WebSocket, WebSocketServer } from "ws";
import { AdbNodeJsCredentialStore } from "./credential.js";

const usb = new WebUSB({ allowAllDevices: true });
const Manager = new AdbDaemonWebUsbDeviceManager(usb);
const CredentialStore = new AdbNodeJsCredentialStore();

const clients = new Set<WebSocket>();

const observer = Manager.trackDevices();

function sendDeviceList(client: WebSocket, devices: AdbDaemonWebUsbDevice[]) {
  client.send(
    JSON.stringify(
      devices.map((device) => ({
        serial: device.serial,
        name: device.name,
        vendorId: device.raw.vendorId,
        productId: device.raw.productId,
      }))
    )
  );
}

observer.onListChange((devices) => {
  for (const client of clients) {
    sendDeviceList(client, devices);
  }
});

const httpServer = createServer(async (request, response) => {
  const url = new URL(request.url!, "http://localhost");
  const segments = url.pathname.substring(1).split("/");

  if (segments[0] !== "device") {
    response.writeHead(404, { "Access-Control-Allow-Origin": "*" }).end();
    return;
  }

  const [, serial] = segments;

  if (!serial) {
    response.writeHead(400, { "Access-Control-Allow-Origin": "*" }).end();
    return;
  }

  if (!devices.has(serial)) {
    const [device] = await Manager.getDevices({
      filters: [{ serialNumber: serial }],
    });
    if (!device) {
      response.writeHead(401, { "Access-Control-Allow-Origin": "*" }).end();
      return;
    }

    const connection = await device.connect();
    const transport = await AdbDaemonTransport.authenticate({
      serial,
      connection,
      credentialStore: CredentialStore,
    });
    const adb = new Adb(transport);

    devices.set(serial, adb);
  }

  const adb = devices.get(serial)!;

  response
    .writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    })
    .end(
      JSON.stringify({
        maxPayloadSize: adb.maxPayloadSize,
        product: adb.banner.product,
        model: adb.banner.model,
        device: adb.banner.device,
        features: adb.banner.features,
      })
    );
});
httpServer.listen(
  {
    host: "0.0.0.0",
    port: 8080,
  },
  () => {
    console.log("Server listening on http://localhost:8080");
  }
);

const wsServer = new WebSocketServer({
  server: httpServer,
});

const devices = new Map<string, Adb>();

wsServer.addListener("connection", async (client, request) => {
  const url = new URL(request.url!, "http://localhost");
  const segments = url.pathname.substring(1).split("/");

  switch (segments[0]) {
    case "devices":
      sendDeviceList(client, await Manager.getDevices());

      clients.add(client);
      client.addListener("close", () => {
        clients.delete(client);
      });

      break;
    case "device":
      {
        const [, serial, service] = segments;
        if (!serial || !service) {
          client.close();
          break;
        }

        const adb = devices.get(serial);
        if (!adb) {
          client.close();
          break;
        }

        try {
          const socket = await adb.createSocket(service);

          client.binaryType = "arraybuffer";

          socket.readable.pipeTo(
            new WritableStream({
              async write(chunk) {
                while (client.bufferedAmount >= 1 * 1024 * 1024) {
                  await delay(10);
                }
                client.send(chunk);
              },
            })
          );

          const writer = socket.writable.getWriter();
          client.addListener("message", async (message) => {
            client.pause();
            await writer.write(new Uint8Array(message as ArrayBuffer));
            client.resume();
          });

          client.addListener("close", () => {
            socket.close();
          });
        } catch {
          client.close();
          break;
        }
      }
      break;
    default:
      client.close();
  }
});