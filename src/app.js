const canvas = document.querySelector("#trackCanvas");
const ctx = canvas.getContext("2d");
const fileInput = document.querySelector("#fileInput");
const loadSampleBtn = document.querySelector("#loadSampleBtn");
const clearBtn = document.querySelector("#clearBtn");
const colorMode = document.querySelector("#colorMode");
const showPoints = document.querySelector("#showPoints");
const showGrid = document.querySelector("#showGrid");
const statsGrid = document.querySelector("#statsGrid");
const trackName = document.querySelector("#trackName");
const trackMeta = document.querySelector("#trackMeta");
const emptyState = document.querySelector("#emptyState");
const tooltip = document.querySelector("#tooltip");
const playBtn = document.querySelector("#playBtn");
const timeSlider = document.querySelector("#timeSlider");
const timeOutput = document.querySelector("#timeOutput");

let points = [];
let projected = [];
let hoverIndex = -1;
let playTimer = null;

const sampleTrack = [
  ["lat", "lng", "time"],
  [31.2304, 121.4737, "2026-07-08T09:00:00Z"],
  [31.2321, 121.4779, "2026-07-08T09:04:00Z"],
  [31.2354, 121.4818, "2026-07-08T09:09:00Z"],
  [31.2398, 121.4863, "2026-07-08T09:16:00Z"],
  [31.2442, 121.4928, "2026-07-08T09:24:00Z"],
  [31.2476, 121.4989, "2026-07-08T09:33:00Z"],
  [31.2529, 121.5037, "2026-07-08T09:42:00Z"],
  [31.2588, 121.5081, "2026-07-08T09:50:00Z"],
  [31.2632, 121.5149, "2026-07-08T09:59:00Z"]
]
  .map((row) => row.join(","))
  .join("\n");

function parseCsv(text) {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(",").map((cell) => cell.trim()));
  const headers = rows.shift().map((header) => header.toLowerCase());
  const latKey = headers.findIndex((h) => ["lat", "latitude", "纬度"].includes(h));
  const lngKey = headers.findIndex((h) => ["lng", "lon", "longitude", "经度"].includes(h));
  const timeKey = headers.findIndex((h) => ["time", "timestamp", "date", "时间"].includes(h));

  if (latKey < 0 || lngKey < 0) {
    throw new Error("CSV 需要包含 lat 和 lng 列。");
  }

  return rows
    .map((row, index) => ({
      lat: Number(row[latKey]),
      lng: Number(row[lngKey]),
      time: timeKey >= 0 ? parseTime(row[timeKey]) : index,
      label: timeKey >= 0 ? row[timeKey] : `点 ${index + 1}`
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function parseGeoJson(text) {
  const geojson = JSON.parse(text);
  const features =
    geojson.type === "FeatureCollection"
      ? geojson.features
      : geojson.type === "Feature"
        ? [geojson]
        : [{ geometry: geojson, properties: {} }];

  const parsed = [];
  features.forEach((feature) => {
    const geometry = feature.geometry;
    if (!geometry) return;

    if (geometry.type === "LineString") {
      geometry.coordinates.forEach(([lng, lat], index) => {
        parsed.push({ lat, lng, time: index, label: `点 ${parsed.length + 1}` });
      });
    }

    if (geometry.type === "Point") {
      const [lng, lat] = geometry.coordinates;
      const rawTime = feature.properties?.time || feature.properties?.timestamp;
      parsed.push({
        lat,
        lng,
        time: rawTime ? parseTime(rawTime) : parsed.length,
        label: rawTime || `点 ${parsed.length + 1}`
      });
    }
  });

  return parsed;
}

function parseTime(value) {
  const date = Date.parse(value);
  if (Number.isFinite(date)) return date;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function enrichTrack(rawPoints) {
  return rawPoints
    .map((point, index, source) => {
      const previous = source[index - 1];
      const distanceFromPrevious = previous ? haversine(previous, point) : 0;
      const hours = previous ? Math.max((point.time - previous.time) / 3600000, 0) : 0;
      return {
        ...point,
        distanceFromPrevious,
        speed: hours > 0 ? distanceFromPrevious / hours : 0
      };
    })
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function haversine(a, b) {
  const radius = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const value = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function toRad(degrees) {
  return (degrees * Math.PI) / 180;
}

function loadTrack(rawPoints, name) {
  points = enrichTrack(rawPoints).sort((a, b) => a.time - b.time);
  timeSlider.value = "100";
  hoverIndex = -1;
  trackName.textContent = name;
  emptyState.hidden = points.length > 0;
  updateStats();
  resizeCanvas();
}

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function projectPoints() {
  if (!points.length) return [];

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const padding = 56;
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latRange = maxLat - minLat || 0.001;
  const lngRange = maxLng - minLng || 0.001;
  const scale = Math.min((width - padding * 2) / lngRange, (height - padding * 2) / latRange);
  const contentWidth = lngRange * scale;
  const contentHeight = latRange * scale;
  const offsetX = (width - contentWidth) / 2;
  const offsetY = (height - contentHeight) / 2;

  return points.map((point) => ({
    ...point,
    x: offsetX + (point.lng - minLng) * scale,
    y: offsetY + contentHeight - (point.lat - minLat) * scale
  }));
}

function draw() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);
  drawBackground(width, height);

  projected = projectPoints();
  const visibleCount = Math.max(0, Math.ceil((projected.length * Number(timeSlider.value)) / 100));
  const visible = projected.slice(0, visibleCount);

  if (visible.length < 2) return;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 5;
  for (let index = 1; index < visible.length; index += 1) {
    ctx.strokeStyle = getSegmentColor(visible[index], index / Math.max(visible.length - 1, 1));
    ctx.beginPath();
    ctx.moveTo(visible[index - 1].x, visible[index - 1].y);
    ctx.lineTo(visible[index].x, visible[index].y);
    ctx.stroke();
  }

  drawEndpoints(visible);

  if (showPoints.checked) {
    visible.forEach((point, index) => drawPoint(point, index === hoverIndex));
  }

  updateTimelineLabel(visible.at(-1));
}

function drawBackground(width, height) {
  ctx.fillStyle = "#edf3fa";
  ctx.fillRect(0, 0, width, height);

  if (!showGrid.checked) return;

  ctx.strokeStyle = "rgba(101, 112, 134, 0.18)";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function getSegmentColor(point, progress) {
  if (colorMode.value === "solid") return "#1267d8";
  if (colorMode.value === "time") return interpolateColor("#1267d8", "#16a34a", progress);

  const maxSpeed = Math.max(...points.map((item) => item.speed), 1);
  const ratio = Math.min(point.speed / maxSpeed, 1);
  if (ratio < 0.5) return interpolateColor("#22c55e", "#facc15", ratio * 2);
  return interpolateColor("#facc15", "#ef4444", (ratio - 0.5) * 2);
}

function interpolateColor(start, end, ratio) {
  const a = hexToRgb(start);
  const b = hexToRgb(end);
  const mixed = a.map((value, index) => Math.round(value + (b[index] - value) * ratio));
  return `rgb(${mixed.join(",")})`;
}

function hexToRgb(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function drawPoint(point, isActive) {
  ctx.fillStyle = isActive ? "#172033" : "#ffffff";
  ctx.strokeStyle = isActive ? "#172033" : "#1267d8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(point.x, point.y, isActive ? 7 : 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawEndpoints(visible) {
  const start = visible[0];
  const end = visible.at(-1);
  ctx.fillStyle = "#16a34a";
  ctx.beginPath();
  ctx.arc(start.x, start.y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e8590c";
  ctx.beginPath();
  ctx.arc(end.x, end.y, 8, 0, Math.PI * 2);
  ctx.fill();
}

function updateStats() {
  const distance = points.reduce((sum, point) => sum + point.distanceFromPrevious, 0);
  const durationMs = points.length > 1 ? points.at(-1).time - points[0].time : 0;
  const durationHours = Math.max(durationMs / 3600000, 0);
  const averageSpeed = durationHours > 0 ? distance / durationHours : 0;
  const values = [
    points.length.toLocaleString("zh-CN"),
    `${distance.toFixed(2)} km`,
    `${(durationHours * 60).toFixed(0)} min`,
    `${averageSpeed.toFixed(1)} km/h`
  ];

  statsGrid.querySelectorAll("dd").forEach((node, index) => {
    node.textContent = values[index];
  });

  trackMeta.textContent = points.length
    ? `${formatPoint(points[0])} -> ${formatPoint(points.at(-1))}`
    : "等待加载数据";
}

function updateTimelineLabel(point) {
  if (!point) {
    timeOutput.textContent = "全部轨迹";
    return;
  }
  timeOutput.textContent = point.label || formatTime(point.time);
}

function formatPoint(point) {
  return `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN") : String(value);
}

function clearTrack() {
  points = [];
  projected = [];
  hoverIndex = -1;
  fileInput.value = "";
  trackName.textContent = "未加载轨迹";
  trackMeta.textContent = "等待加载数据";
  emptyState.hidden = false;
  updateStats();
  stopPlayback();
  draw();
}

async function handleFile(file) {
  const text = await file.text();
  const rawPoints = file.name.endsWith(".csv") ? parseCsv(text) : parseGeoJson(text);
  if (rawPoints.length < 2) throw new Error("至少需要两个有效轨迹点。");
  loadTrack(rawPoints, file.name);
}

function stopPlayback() {
  window.clearInterval(playTimer);
  playTimer = null;
  playBtn.textContent = "▶";
}

fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    await handleFile(file);
  } catch (error) {
    alert(error.message);
  }
});

loadSampleBtn.addEventListener("click", () => {
  loadTrack(parseCsv(sampleTrack), "上海示例轨迹");
});

clearBtn.addEventListener("click", clearTrack);

[colorMode, showPoints, showGrid, timeSlider].forEach((control) => {
  control.addEventListener("input", draw);
});

playBtn.addEventListener("click", () => {
  if (playTimer) {
    stopPlayback();
    return;
  }
  playBtn.textContent = "Ⅱ";
  timeSlider.value = "0";
  playTimer = window.setInterval(() => {
    const next = Number(timeSlider.value) + 2;
    timeSlider.value = String(next);
    draw();
    if (next >= 100) stopPlayback();
  }, 90);
});

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const visibleCount = Math.ceil((projected.length * Number(timeSlider.value)) / 100);
  const visible = projected.slice(0, visibleCount);
  hoverIndex = visible.findIndex((point) => Math.hypot(point.x - x, point.y - y) < 9);

  if (hoverIndex >= 0) {
    const point = visible[hoverIndex];
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(x + 14, rect.width - 220)}px`;
    tooltip.style.top = `${Math.max(y - 16, 12)}px`;
    tooltip.innerHTML = `
      <strong>${point.label || formatTime(point.time)}</strong><br>
      坐标：${formatPoint(point)}<br>
      速度：${point.speed.toFixed(1)} km/h
    `;
  } else {
    tooltip.hidden = true;
  }
  draw();
});

canvas.addEventListener("mouseleave", () => {
  hoverIndex = -1;
  tooltip.hidden = true;
  draw();
});

window.addEventListener("resize", resizeCanvas);

loadTrack(parseCsv(sampleTrack), "上海示例轨迹");
