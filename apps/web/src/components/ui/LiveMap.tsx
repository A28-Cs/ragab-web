'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import 'leaflet/dist/leaflet.css';

// Dynamically import Leaflet components so it doesn't break SSR
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });

let customIcon: any = null;

interface LiveMapProps {
  orderId: string;
}

export function LiveMap({ orderId }: LiveMapProps) {
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    // Initialize leaflet icon client-side only
    if (typeof window !== 'undefined') {
      const L = require('leaflet');
      customIcon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
      });
    }

    if (!orderId) return;

    // Listen to Engezny's Firestore order document for deliveryLocation changes
    const orderRef = doc(db, 'orders', orderId);
    const unsubscribe = onSnapshot(orderRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.deliveryLocation) {
          setDriverLocation({
            lat: data.deliveryLocation.latitude || data.deliveryLocation._lat,
            lng: data.deliveryLocation.longitude || data.deliveryLocation._long,
          });
        }
      }
    });

    return () => unsubscribe();
  }, [orderId]);

  if (!driverLocation) {
    return (
      <div className="w-full h-48 bg-slate-100 animate-pulse rounded-lg flex items-center justify-center">
        <span className="text-slate-500">جاري البحث عن موقع المندوب...</span>
      </div>
    );
  }

  return (
    <div className="w-full h-64 rounded-lg overflow-hidden border">
      <MapContainer 
        center={[driverLocation.lat, driverLocation.lng]} 
        zoom={16} 
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        <Marker position={[driverLocation.lat, driverLocation.lng]} icon={customIcon}>
          <Popup>المندوب في الطريق</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
