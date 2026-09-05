"use client";

import { useEffect, useRef, useMemo } from "react";
import "leaflet/dist/leaflet.css";

export interface MarkerData {
  id?: string;
  lat: number;
  lng: number;
  label: string;
  status?: "online" | "offline" | "grace";
  detail?: string | null;
  accountName?: string;
  lastSync?: string;
}

interface CervosMapProps {
  center?: [number, number];
  zoom?: number;
  markers?: MarkerData[];
  className?: string;
  onMarkerClick?: (marker: MarkerData) => void;
  onMapClick?: (location: { lat: number; lng: number }) => void;
  selectedId?: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  online: "#1039b9",
  grace: "#d97706",
  offline: "#ba1a1a",
  active: "#1039b9",
  trial: "#1039b9",
  locked: "#ba1a1a",
};

function createMarkerIcon(L: typeof import("leaflet"), m: MarkerData, isSelected: boolean) {
  const color = STATUS_COLORS[m.status ?? "online"] ?? STATUS_COLORS.online;
  const size = isSelected ? 20 : 14;
  const zOffset = isSelected ? 1000 : 0;

  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border:3px solid ${isSelected ? "#fff" : "rgba(255,255,255,0.7)"};
      border-radius:50%;
      box-shadow:0 2px 8px rgba(0,0,0,0.5);
      cursor:pointer;
      position:relative;
      z-index:${zOffset};
    ">
      ${m.status === "online" ? `<div style="
        position:absolute;inset:-5px;border-radius:50%;
        border:2px solid ${color};
        opacity:0.4;
        animation:pulse-ring 2s ease infinite;
      "></div>` : ""}
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function createPopupContent(m: MarkerData): string {
  const color = STATUS_COLORS[m.status ?? "online"] ?? STATUS_COLORS.online;
  return [
    `<div style="min-width:180px;font-family:system-ui,-apple-system,sans-serif">`,
    `<div style="font-weight:700;font-size:14px;margin-bottom:4px;color:#fff">${m.label}</div>`,
    m.accountName ? `<div style="font-size:12px;color:#ccc;margin-bottom:4px">${m.accountName}</div>` : "",
    m.detail ? `<div style="font-size:12px;color:#aaa;margin-bottom:4px">${m.detail}</div>` : "",
    m.lastSync ? `<div style="font-size:11px;color:#888;margin-top:4px">Last sync: ${m.lastSync}</div>` : "",
    `<div style="margin-top:6px;font-size:11px;font-weight:600;color:${color};text-transform:uppercase">${m.status ?? "active"}</div>`,
    `</div>`,
  ].join("");
}

export default function CervosMap({
  center = [-6.816, 39.2803],
  zoom = 11,
  markers = [],
  className = "h-full w-full",
  onMarkerClick,
  onMapClick,
  selectedId,
}: CervosMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const markersLayerRef = useRef<unknown>(null);
  const leafletLoadedRef = useRef(false);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  const markersKey = useMemo(
    () => markers.map((m) => `${m.id ?? m.lat},${m.lng},${m.status},${m.label}`).join("|"),
    [markers]
  );

  // 1) Initialize map once
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current || mapInstanceRef.current) return;

      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current, {
        center,
        zoom,
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
      });

      map.on("click", (e) => {
        onMapClickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        className: "cervos-dark-tiles",
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
      markersLayerRef.current = L.layerGroup().addTo(map);
      leafletLoadedRef.current = true;
    });

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
        markersLayerRef.current = null;
      }
    };
  }, []); // intentionally empty — map mounts once

  // 2) Sync markers whenever they change
  useEffect(() => {
    if (!leafletLoadedRef.current || !mapInstanceRef.current || !markersLayerRef.current) return;

    import("leaflet").then((L) => {
      const layer = markersLayerRef.current as ReturnType<typeof L.layerGroup>;
      if (!layer) return;

      layer.clearLayers();

      markers.forEach((m) => {
        const icon = createMarkerIcon(L, m, m.id === selectedId);
        const marker = L.marker([m.lat, m.lng], { icon }).addTo(layer);
        marker.bindPopup(createPopupContent(m), { maxWidth: 220, className: "cervos-dark-popup" });

        if (onMarkerClick) {
          marker.on("click", () => onMarkerClick(m));
        }
      });

      // Fit bounds if multiple markers
      if (markers.length > 1) {
        const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]));
        (mapInstanceRef.current as { fitBounds: (b: unknown, o?: unknown) => void }).fitBounds(bounds, { padding: [40, 40] });
      }
    });
  }, [markersKey, selectedId, onMarkerClick, markers]);

  // 3) Update center/zoom when props change
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current as { setView: (c: [number, number], z?: number) => void };
    map.setView(center, zoom);
  }, [center, zoom]);

  return (
    <>
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.4; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .cervos-dark-tiles {
          filter: brightness(0.6) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3) brightness(0.7);
        }
        .leaflet-popup-content-wrapper {
          border-radius: 8px !important;
          background: #1e1e2e !important;
          color: #fff !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
        }
        .leaflet-popup-tip { background: #1e1e2e !important; }
        .leaflet-popup-content { margin: 12px !important; color: #fff !important; }
        .leaflet-popup-close-button { color: #aaa !important; }
        .leaflet-popup-close-button:hover { color: #fff !important; }
      `}</style>
      <div ref={mapRef} className={className} />
    </>
  );
}