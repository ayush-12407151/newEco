const navToggle = document.getElementById("nav-toggle") || document.getElementById("cinematic-nav-toggle");
const navMenu = document.getElementById("nav-menu") || document.getElementById("cinematic-nav-menu");
const navLinks = document.querySelectorAll(".nav-menu a, .cinematic-nav-menu a");
const revealElements = document.querySelectorAll(".reveal");
const counters = document.querySelectorAll(".counter");
const newsletterForm = document.getElementById("newsletter-form");
const newsletterMessage = document.getElementById("newsletter-message");
const mapElement = document.getElementById("waste-map");
const locationSelect = document.getElementById("map-location-select");
const liveLocationButton = document.getElementById("use-live-location");
const mapModeLabel = document.getElementById("map-mode-label");
const mapCoordinates = document.getElementById("map-coordinates");
const mapStatsValue = document.getElementById("map-stats-value");

if (navToggle && navMenu) {
  navToggle.addEventListener("click", () => {
    const isOpen = navMenu.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      navMenu.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

const revealObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.18 }
);

revealElements.forEach((element) => {
  revealObserver.observe(element);
});

const animateCounter = (counter) => {
  const target = Number(counter.dataset.target);
  const duration = 1600;
  const startTime = performance.now();

  const updateValue = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const currentValue = Math.floor(progress * target);

    counter.textContent = currentValue.toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(updateValue);
    } else {
      counter.textContent = target.toLocaleString();
    }
  };

  requestAnimationFrame(updateValue);
};

const counterObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.6 }
);

counters.forEach((counter) => {
  counterObserver.observe(counter);
});

if (newsletterForm && newsletterMessage) {
  newsletterForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const emailInput = newsletterForm.querySelector("input");
    newsletterMessage.textContent = `Thanks for subscribing, ${emailInput.value}.`;
    newsletterForm.reset();
  });
}

if (mapElement && window.L) {
  const presetLocations = {
    delhi: { name: "New Delhi", center: [28.6139, 77.209] },
    mumbai: { name: "Mumbai", center: [19.076, 72.8777] },
    bengaluru: { name: "Bengaluru", center: [12.9716, 77.5946] },
    kolkata: { name: "Kolkata", center: [22.5726, 88.3639] },
  };

  const wasteMap = L.map(mapElement, {
    zoomControl: false,
    scrollWheelZoom: false,
  }).setView(presetLocations.delhi.center, 14);

  L.control.zoom({ position: "bottomright" }).addTo(wasteMap);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(wasteMap);

  const layers = {
    bins: L.layerGroup().addTo(wasteMap),
    plants: L.layerGroup().addTo(wasteMap),
    trucks: L.layerGroup().addTo(wasteMap),
    routes: L.layerGroup().addTo(wasteMap),
    user: L.layerGroup().addTo(wasteMap),
  };

  const markerIcons = {
    bin: createMarkerIcon("bin"),
    plant: createMarkerIcon("plant"),
    truck: createMarkerIcon("truck"),
    user: createMarkerIcon("user"),
  };

  let currentCenter = presetLocations.delhi.center;
  let truckFleet = [];
  let truckTimer = null;
  let userWatchId = null;
  let followingLiveLocation = true;

  function createMarkerIcon(type) {
    const iconSize =
      type === "user" ? [22, 22] : type === "truck" ? [24, 14] : [18, 18];
    const iconAnchor =
      type === "user" ? [11, 11] : type === "truck" ? [12, 7] : [9, 9];
    const iconMarkup =
      type === "truck"
        ? '<span class="map-truck-icon"><span class="map-truck-body"></span><span class="map-truck-cab"></span><span class="map-truck-wheels"></span></span>'
        : `<span class="map-marker ${type}"></span>`;

    return L.divIcon({
      className: "map-div-icon",
      html: iconMarkup,
      iconSize,
      iconAnchor,
      popupAnchor: [0, -10],
    });
  }

  function seededRandom(seed) {
    const value = Math.sin(seed) * 10000;
    return value - Math.floor(value);
  }

  function createOffsets(center, total, spread, seedBase) {
    return Array.from({ length: total }, (_, index) => {
      const seed = seedBase + index * 1.73;
      const latOffset = (seededRandom(seed) - 0.5) * spread;
      const lngOffset = (seededRandom(seed + 0.91) - 0.5) * spread;

      return [center[0] + latOffset, center[1] + lngOffset];
    });
  }

  function buildAreaData(center, areaName) {
    const baseSeed = Math.abs(Math.round(center[0] * 1000) + Math.round(center[1] * 1000));
    const bins = createOffsets(center, 8, 0.035, baseSeed + 10).map((position, index) => ({
      position,
      title: `Dustbin ${index + 1}`,
      detail: `Simulated smart bin in ${areaName}`,
      fillLevel: `${48 + ((index * 7) % 42)}% full`,
    }));

    const plants = createOffsets(center, 2, 0.05, baseSeed + 200).map((position, index) => ({
      position,
      title: index === 0 ? "Material Recovery Plant" : "Waste Transfer Station",
      detail: `Simulated processing facility near ${areaName}`,
    }));

    const routes = createTruckRoutes(center);

    const trucks = routes.map((route, index) => ({
      position: route[0],
      title: `Pickup Truck ${index + 1}`,
      detail: `Simulated route active in ${areaName}`,
      route,
      progress: seededRandom(baseSeed + 500 + index) * (route.length - 1),
      speed: 0.08 + seededRandom(baseSeed + 520 + index) * 0.04,
    }));

    return { bins, plants, trucks, routes };
  }

  function createTruckRoutes(center) {
    const [lat, lng] = center;

    return [
      [
        [lat + 0.008, lng - 0.012],
        [lat + 0.008, lng - 0.003],
        [lat + 0.0074, lng + 0.006],
        [lat + 0.0068, lng + 0.012],
      ],
    ];
  }

  function getPointOnRoute(route, progress) {
    const segmentCount = route.length - 1;
    const normalizedProgress = ((progress % segmentCount) + segmentCount) % segmentCount;
    const segmentIndex = Math.floor(normalizedProgress);
    const segmentProgress = normalizedProgress - segmentIndex;
    const start = route[segmentIndex];
    const end = route[segmentIndex + 1];

    return [
      start[0] + (end[0] - start[0]) * segmentProgress,
      start[1] + (end[1] - start[1]) * segmentProgress,
    ];
  }

  function formatCoordinates(center) {
    return `${center[0].toFixed(4)}, ${center[1].toFixed(4)}`;
  }

  function updateMapDetails(modeLabel, center, statsText) {
    if (mapModeLabel) {
      mapModeLabel.textContent = modeLabel;
    }

    if (mapCoordinates) {
      mapCoordinates.textContent = formatCoordinates(center);
    }

    if (mapStatsValue) {
      mapStatsValue.textContent = statsText;
    }
  }

  function clearAssetLayers() {
    layers.bins.clearLayers();
    layers.plants.clearLayers();
    layers.trucks.clearLayers();
    layers.routes.clearLayers();
  }

  function renderUserMarker(center) {
    layers.user.clearLayers();
    L.marker(center, { icon: markerIcons.user })
      .bindPopup("Your current location")
      .addTo(layers.user);
  }

  function renderArea(center, areaName, modeLabel) {
    const areaData = buildAreaData(center, areaName);
    currentCenter = center;

    clearAssetLayers();

    areaData.bins.forEach((bin) => {
      L.marker(bin.position, { icon: markerIcons.bin })
        .bindPopup(`<strong>${bin.title}</strong><br>${bin.detail}<br>${bin.fillLevel}`)
        .addTo(layers.bins);
    });

    areaData.plants.forEach((plant) => {
      L.marker(plant.position, { icon: markerIcons.plant })
        .bindPopup(`<strong>${plant.title}</strong><br>${plant.detail}`)
        .addTo(layers.plants);
    });

    areaData.routes.forEach((route) => {
      L.polyline(route, {
        color: "#6e8091",
        weight: 4,
        opacity: 0.28,
        lineCap: "round",
      }).addTo(layers.routes);
    });

    truckFleet = areaData.trucks.map((truck) => {
      const marker = L.marker(getPointOnRoute(truck.route, truck.progress), { icon: markerIcons.truck })
        .bindPopup(`<strong>${truck.title}</strong><br>${truck.detail}`)
        .addTo(layers.trucks);

      return {
        ...truck,
        marker,
      };
    });

    updateMapDetails(
      modeLabel,
      center,
      `${areaData.bins.length} bins · ${areaData.plants.length} plants · ${areaData.trucks.length} trucks`
    );

    wasteMap.setView(center, 14, { animate: true });
  }

  function startTruckAnimation() {
    if (truckTimer) {
      window.clearInterval(truckTimer);
    }

    truckTimer = window.setInterval(() => {
      truckFleet.forEach((truck) => {
        const segmentCount = truck.route.length - 1;
        truck.progress = (truck.progress + truck.speed) % segmentCount;
        truck.position = getPointOnRoute(truck.route, truck.progress);
        truck.marker.setLatLng(truck.position);
      });
    }, 900);
  }

  function showPresetLocation(key) {
    const preset = presetLocations[key];

    if (!preset) {
      return;
    }

    followingLiveLocation = false;
    layers.user.clearLayers();
    renderArea(preset.center, preset.name, `Viewing ${preset.name}`);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      followingLiveLocation = false;
      renderArea(presetLocations.delhi.center, "New Delhi", "Live location unavailable");
      return;
    }

    followingLiveLocation = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const center = [position.coords.latitude, position.coords.longitude];
        renderUserMarker(center);
        renderArea(center, "your area", "Tracking live location");
      },
      () => {
        followingLiveLocation = false;
        if (locationSelect) {
          locationSelect.value = "delhi";
        }
        renderArea(presetLocations.delhi.center, "New Delhi", "Using fallback area");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );

    if (userWatchId === null) {
      userWatchId = navigator.geolocation.watchPosition(
        (position) => {
          const center = [position.coords.latitude, position.coords.longitude];

          if (followingLiveLocation) {
            renderUserMarker(center);
            renderArea(center, "your area", "Tracking live location");
          }
        },
        () => {},
        {
          enableHighAccuracy: true,
          maximumAge: 12000,
          timeout: 15000,
        }
      );
    }
  }

  if (locationSelect) {
    locationSelect.addEventListener("change", (event) => {
      const selectedValue = event.target.value;

      if (selectedValue === "live") {
        useCurrentLocation();
        return;
      }

      showPresetLocation(selectedValue);
    });
  }

  if (liveLocationButton) {
    liveLocationButton.addEventListener("click", () => {
      if (locationSelect) {
        locationSelect.value = "live";
      }

      useCurrentLocation();
    });
  }

  renderArea(presetLocations.delhi.center, "New Delhi", "Loading nearby map");
  startTruckAnimation();
  useCurrentLocation();
}
