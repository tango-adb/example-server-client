interface Device {
  serial: string;
  name: string;
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

    const anchor = document.createElement("a");
    anchor.href = `/device/?serial=${device.serial}`;
    anchor.textContent = "Open";
    row.insertCell().appendChild(anchor);
  }
});
