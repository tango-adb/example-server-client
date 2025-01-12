interface Device {
  serial: string;
  name: string;
  vendorId: number;
  productId: number;
}

function trackDevices(callback: (devices: Device[]) => void) {
  const socket = new WebSocket("http://localhost:8080/devices");
  socket.addEventListener("message", ({ data }) => {
    callback(JSON.parse(data));
  });
}

const container = document.getElementById("devices") as HTMLTableSectionElement;

trackDevices((devices) => {
  container.replaceChildren();

  for (const device of devices) {
    const row = container.insertRow();

    row.insertCell().textContent = device.serial;
    row.insertCell().textContent = device.name;
    row.insertCell().textContent = device.vendorId.toString(16);
    row.insertCell().textContent = device.productId.toString(16);

    const anchor = document.createElement("a");
    anchor.href = `/device/?serial=${device.serial}`;
    anchor.textContent = "Open";
    row.insertCell().appendChild(anchor);
  }
});
