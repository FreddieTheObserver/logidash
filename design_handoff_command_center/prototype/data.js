/* logidash mock data — deterministic, hardcoded. Exposed on window.DB.
   Mirrors the backend domain: zones, vehicles, drivers, deliveries,
   assignments, recommendation runs/candidates, audit logs, users. */
(function () {
  "use strict";

  const zones = [
    { id: "z1", name: "Downtown Core",   code: "DTC", lat: 40.713, lng: -74.006 },
    { id: "z2", name: "North Bay",       code: "NBY", lat: 40.802, lng: -73.961 },
    { id: "z3", name: "Eastside",        code: "EST", lat: 40.730, lng: -73.951 },
    { id: "z4", name: "Harbor District", code: "HBR", lat: 40.690, lng: -74.045 },
    { id: "z5", name: "West Hills",      code: "WHL", lat: 40.760, lng: -74.060 },
  ];

  const vehicleTypes = [
    { type: "bike",  label: "Bike",  capacityWeight: 15,   capacityVolume: 60,   note: "Small parcels, dense zones" },
    { type: "car",   label: "Car",   capacityWeight: 120,  capacityVolume: 400,  note: "Standard multi-drop" },
    { type: "van",   label: "Van",   capacityWeight: 900,  capacityVolume: 6000, note: "Bulk & medium freight" },
    { type: "truck", label: "Truck", capacityWeight: 4500, capacityVolume: 22000, note: "Heavy / palletized" },
  ];

  // Vehicles (a driver's assigned vehicle; remaining capacity precomputed for demo)
  const vehicles = [
    { id: "v1", plate: "BK-1180", type: "bike",  status: "active",   capacityWeight: 15,   capacityVolume: 60,   usedWeight: 4 },
    { id: "v2", plate: "CR-4471", type: "car",   status: "active",   capacityWeight: 120,  capacityVolume: 400,  usedWeight: 28 },
    { id: "v3", plate: "VN-2093", type: "van",   status: "active",   capacityWeight: 900,  capacityVolume: 6000, usedWeight: 210 },
    { id: "v4", plate: "VN-7755", type: "van",   status: "active",   capacityWeight: 900,  capacityVolume: 6000, usedWeight: 640 },
    { id: "v5", plate: "TK-3310", type: "truck", status: "active",   capacityWeight: 4500, capacityVolume: 22000, usedWeight: 1200 },
    { id: "v6", plate: "CR-8829", type: "car",   status: "active",   capacityWeight: 120,  capacityVolume: 400,  usedWeight: 12 },
    { id: "v7", plate: "BK-6642", type: "bike",  status: "active",   capacityWeight: 15,   capacityVolume: 60,   usedWeight: 9 },
    { id: "v8", plate: "VN-5521", type: "van",   status: "inactive", capacityWeight: 900,  capacityVolume: 6000, usedWeight: 0 },
    { id: "v9", plate: "CR-1107", type: "car",   status: "active",   capacityWeight: 120,  capacityVolume: 400,  usedWeight: 90 },
  ];

  const drivers = [
    { id: "d1", name: "Marcus Webb",     initials: "MW", availability: "available", baseZoneId: "z1", vehicleId: "v2", activeJobCount: 1, maxConcurrentJobs: 4, phone: "+1 555 0182", joined: "2024-03-11" },
    { id: "d2", name: "Priya Anand",     initials: "PA", availability: "available", baseZoneId: "z1", vehicleId: "v6", activeJobCount: 0, maxConcurrentJobs: 4, phone: "+1 555 0114", joined: "2023-09-02" },
    { id: "d3", name: "Diego Santos",    initials: "DS", availability: "available", baseZoneId: "z3", vehicleId: "v3", activeJobCount: 2, maxConcurrentJobs: 5, phone: "+1 555 0167", joined: "2024-01-20" },
    { id: "d4", name: "Hana Kim",        initials: "HK", availability: "busy",      baseZoneId: "z2", vehicleId: "v4", activeJobCount: 3, maxConcurrentJobs: 4, phone: "+1 555 0143", joined: "2022-11-30" },
    { id: "d5", name: "Owen Fletcher",   initials: "OF", availability: "available", baseZoneId: "z4", vehicleId: "v5", activeJobCount: 1, maxConcurrentJobs: 3, phone: "+1 555 0199", joined: "2023-06-18" },
    { id: "d6", name: "Lena Brandt",     initials: "LB", availability: "available", baseZoneId: "z2", vehicleId: "v7", activeJobCount: 0, maxConcurrentJobs: 3, phone: "+1 555 0121", joined: "2024-05-04" },
    { id: "d7", name: "Tomás Ferreira",  initials: "TF", availability: "busy",      baseZoneId: "z1", vehicleId: "v9", activeJobCount: 4, maxConcurrentJobs: 4, phone: "+1 555 0176", joined: "2023-02-14" },
    { id: "d8", name: "Aisha Rahman",    initials: "AR", availability: "offline",   baseZoneId: "z5", vehicleId: "v8", activeJobCount: 0, maxConcurrentJobs: 4, phone: "+1 555 0150", joined: "2024-08-22" },
  ];

  // Deliveries — varied status, priority, zone, deadline, assignment state.
  // "ready" delivery DLV-2041 is the focus for the recommendation panel.
  const now = new Date("2026-06-02T09:15:00");
  const hrs = (h) => new Date(now.getTime() + h * 3600 * 1000).toISOString();

  const deliveries = [
    { id: "dl1",  reference: "DLV-2041", status: "ready",      priority: "high",   zoneId: "z1", packageSize: "medium", packageWeight: 18, packageType: "electronics", pickupAddress: "412 Canal St", dropoffAddress: "88 Greenwich Ave", deadlineAt: hrs(3.5),  driverId: null, createdAt: hrs(-2) },
    { id: "dl2",  reference: "DLV-2040", status: "assigned",   priority: "urgent", zoneId: "z2", packageSize: "small",  packageWeight: 3,  packageType: "documents",   pickupAddress: "19 Lexington Ave", dropoffAddress: "300 North Bay Rd", deadlineAt: hrs(1.25), driverId: "d4", createdAt: hrs(-4) },
    { id: "dl3",  reference: "DLV-2039", status: "in_transit", priority: "normal", zoneId: "z3", packageSize: "large",  packageWeight: 220, packageType: "furniture",  pickupAddress: "55 Eastside Blvd", dropoffAddress: "7 Maple Court", deadlineAt: hrs(5),    driverId: "d3", createdAt: hrs(-6) },
    { id: "dl4",  reference: "DLV-2038", status: "picked_up",  priority: "high",   zoneId: "z1", packageSize: "medium", packageWeight: 34, packageType: "retail",      pickupAddress: "210 Spring St", dropoffAddress: "1 Battery Pl", deadlineAt: hrs(0.5),  driverId: "d7", createdAt: hrs(-3) },
    { id: "dl5",  reference: "DLV-2037", status: "ready",      priority: "normal", zoneId: "z4", packageSize: "large",  packageWeight: 410, packageType: "appliances", pickupAddress: "9 Harbor Way", dropoffAddress: "44 Pier Seven", deadlineAt: hrs(7),    driverId: null, createdAt: hrs(-1.5) },
    { id: "dl6",  reference: "DLV-2036", status: "delivered",  priority: "normal", zoneId: "z2", packageSize: "small",  packageWeight: 2,  packageType: "documents",   pickupAddress: "120 Bay Ridge", dropoffAddress: "501 Crescent St", deadlineAt: hrs(-1),   driverId: "d6", createdAt: hrs(-9) },
    { id: "dl7",  reference: "DLV-2035", status: "failed",     priority: "high",   zoneId: "z5", packageSize: "medium", packageWeight: 22, packageType: "fragile",     pickupAddress: "77 West Hills Dr", dropoffAddress: "12 Summit Ave", deadlineAt: hrs(-2),   driverId: "d8", createdAt: hrs(-11) },
    { id: "dl8",  reference: "DLV-2034", status: "draft",      priority: "low",    zoneId: "z3", packageSize: "small",  packageWeight: 5,  packageType: "retail",      pickupAddress: "33 Eastside Blvd", dropoffAddress: "210 Oak Lane", deadlineAt: hrs(11),   driverId: null, createdAt: hrs(-0.5) },
    { id: "dl9",  reference: "DLV-2033", status: "ready",      priority: "urgent", zoneId: "z1", packageSize: "small",  packageWeight: 4,  packageType: "medical",     pickupAddress: "500 Hudson St", dropoffAddress: "9 Charlton St", deadlineAt: hrs(0.75), driverId: null, createdAt: hrs(-0.8) },
    { id: "dl10", reference: "DLV-2032", status: "in_transit", priority: "normal", zoneId: "z2", packageSize: "medium", packageWeight: 41, packageType: "retail",      pickupAddress: "88 North Bay Rd", dropoffAddress: "14 Cliff St", deadlineAt: hrs(4),    driverId: "d4", createdAt: hrs(-7) },
    { id: "dl11", reference: "DLV-2031", status: "assigned",   priority: "high",   zoneId: "z4", packageSize: "large",  packageWeight: 360, packageType: "appliances", pickupAddress: "2 Harbor Way", dropoffAddress: "60 Dockside", deadlineAt: hrs(6),    driverId: "d5", createdAt: hrs(-5) },
    { id: "dl12", reference: "DLV-2030", status: "cancelled",  priority: "low",    zoneId: "z5", packageSize: "small",  packageWeight: 1,  packageType: "documents",   pickupAddress: "41 Summit Ave", dropoffAddress: "8 Ridge Rd", deadlineAt: hrs(-3),   driverId: null, createdAt: hrs(-12), cancellationReason: "Customer rescheduled" },
    { id: "dl13", reference: "DLV-2029", status: "delivered",  priority: "high",   zoneId: "z1", packageSize: "medium", packageWeight: 27, packageType: "electronics", pickupAddress: "300 Canal St", dropoffAddress: "5 Vestry St", deadlineAt: hrs(-4),   driverId: "d1", createdAt: hrs(-13) },
    { id: "dl14", reference: "DLV-2028", status: "delivered",  priority: "normal", zoneId: "z3", packageSize: "large",  packageWeight: 180, packageType: "furniture",  pickupAddress: "61 Eastside Blvd", dropoffAddress: "90 Maple Court", deadlineAt: hrs(-6),   driverId: "d3", createdAt: hrs(-15) },
  ];

  // Route estimate for the focus delivery (ORS cached, driver base zone -> pickup)
  const routeEstimate = { distanceMeters: 2840, durationSeconds: 612, provider: "openrouteservice", fetchedAt: hrs(-0.1), degraded: false };

  // Recommendation run for DLV-2041 (zone z1, medium 18kg electronics, high priority, deadline +3.5h)
  // weights: zoneFit .30, routeProximity .25, remainingCapacity .15, workloadBalance .15, deadlineFit .10, priorityFit .05
  const WEIGHTS = { zoneFit: 0.30, routeProximity: 0.25, remainingCapacity: 0.15, workloadBalance: 0.15, deadlineFit: 0.10, priorityFit: 0.05 };

  function mkFactor(factor, weight, rawValue, reason) {
    return { factor, weight, rawValue, weighted: +(rawValue * weight * 100).toFixed(1), reason };
  }

  const recommendationCandidates = [
    {
      driverId: "d2", eligible: true, rank: 1,
      factors: [
        mkFactor("zoneFit",           WEIGHTS.zoneFit,           1.00, "Based in Downtown Core — same zone as the delivery."),
        mkFactor("routeProximity",    WEIGHTS.routeProximity,    0.94, "2.8 km / ~10 min from base to pickup (ORS)."),
        mkFactor("remainingCapacity", WEIGHTS.remainingCapacity, 0.86, "Car with 92 kg headroom for an 18 kg parcel."),
        mkFactor("workloadBalance",   WEIGHTS.workloadBalance,   0.95, "0 of 4 active jobs — most available capacity."),
        mkFactor("deadlineFit",       WEIGHTS.deadlineFit,       0.90, "Comfortably meets the 3h 30m deadline."),
        mkFactor("priorityFit",       WEIGHTS.priorityFit,       0.80, "Reliable on high-priority runs."),
      ],
    },
    {
      driverId: "d1", eligible: true, rank: 2,
      factors: [
        mkFactor("zoneFit",           WEIGHTS.zoneFit,           1.00, "Based in Downtown Core — same zone as the delivery."),
        mkFactor("routeProximity",    WEIGHTS.routeProximity,    0.78, "4.1 km / ~14 min from base to pickup (ORS)."),
        mkFactor("remainingCapacity", WEIGHTS.remainingCapacity, 0.80, "Car with 92 kg headroom for an 18 kg parcel."),
        mkFactor("workloadBalance",   WEIGHTS.workloadBalance,   0.70, "1 of 4 active jobs."),
        mkFactor("deadlineFit",       WEIGHTS.deadlineFit,       0.82, "Meets deadline with moderate buffer."),
        mkFactor("priorityFit",       WEIGHTS.priorityFit,       0.85, "Strong track record on high-priority runs."),
      ],
    },
    {
      driverId: "d3", eligible: true, rank: 3,
      factors: [
        mkFactor("zoneFit",           WEIGHTS.zoneFit,           0.55, "Based in Eastside — adjacent zone, normalized by distance."),
        mkFactor("routeProximity",    WEIGHTS.routeProximity,    0.66, "6.7 km / ~22 min from base to pickup (ORS)."),
        mkFactor("remainingCapacity", WEIGHTS.remainingCapacity, 0.96, "Van with 690 kg headroom — ample for 18 kg."),
        mkFactor("workloadBalance",   WEIGHTS.workloadBalance,   0.55, "2 of 5 active jobs."),
        mkFactor("deadlineFit",       WEIGHTS.deadlineFit,       0.62, "Can meet deadline; cross-zone travel reduces buffer."),
        mkFactor("priorityFit",       WEIGHTS.priorityFit,       0.60, "Suited to normal/high priority."),
      ],
    },
    {
      driverId: "d6", eligible: true, rank: 4,
      factors: [
        mkFactor("zoneFit",           WEIGHTS.zoneFit,           0.40, "Based in North Bay — two zones out, normalized by distance."),
        mkFactor("routeProximity",    WEIGHTS.routeProximity,    0.45, "9.3 km / ~31 min from base to pickup (ORS)."),
        mkFactor("remainingCapacity", WEIGHTS.remainingCapacity, 0.70, "Bike near its 15 kg limit for an 18 kg parcel."),
        mkFactor("workloadBalance",   WEIGHTS.workloadBalance,   0.95, "0 of 3 active jobs."),
        mkFactor("deadlineFit",       WEIGHTS.deadlineFit,       0.38, "Tight against deadline given cross-zone travel."),
        mkFactor("priorityFit",       WEIGHTS.priorityFit,       0.40, "Better matched to normal priority."),
      ],
    },
    {
      driverId: "d7", eligible: false, rank: null,
      ineligibleReasons: [
        "Availability is busy (must be available).",
        "Workload at maximum — 4 of 4 active jobs.",
      ],
      factors: [],
    },
    {
      driverId: "d4", eligible: false, rank: null,
      ineligibleReasons: [
        "Availability is busy (must be available).",
      ],
      factors: [],
    },
  ];

  // compute scores from factor contributions
  recommendationCandidates.forEach((c) => {
    c.score = c.eligible ? Math.round(c.factors.reduce((s, f) => s + f.weighted, 0)) : null;
  });

  const recommendationRun = {
    id: "run_8841", deliveryId: "dl1", requestedBy: "Jordan Lee", createdAt: hrs(-0.1),
    weights: WEIGHTS, candidates: recommendationCandidates, routeEstimate,
  };

  // Audit timeline for the focus delivery
  const auditByDelivery = {
    dl1: [
      { action: "delivery.created",     actor: "Jordan Lee",   role: "dispatcher", at: hrs(-2),   reason: "Created from intake form" },
      { action: "delivery.geocoded",    actor: "system",       role: "system",     at: hrs(-1.95), reason: "Pickup & dropoff geocoded via ORS" },
      { action: "delivery.status",      actor: "Jordan Lee",   role: "dispatcher", at: hrs(-1.9),  reason: "draft → ready" },
      { action: "recommendations.run",  actor: "Jordan Lee",   role: "dispatcher", at: hrs(-0.1),  reason: "6 candidates scored, 4 eligible" },
    ],
    dl2: [
      { action: "delivery.created",  actor: "Jordan Lee", role: "dispatcher", at: hrs(-4),   reason: "Created from intake form" },
      { action: "delivery.status",   actor: "Jordan Lee", role: "dispatcher", at: hrs(-3.6),  reason: "draft → ready" },
      { action: "assignment.created", actor: "Jordan Lee", role: "dispatcher", at: hrs(-3.4),  reason: "Assigned Hana Kim (VN-7755)" },
      { action: "delivery.status",   actor: "Jordan Lee", role: "dispatcher", at: hrs(-3.4),  reason: "ready → assigned" },
    ],
  };

  // Assignment history per driver
  const assignmentHistory = {
    d1: [
      { reference: "DLV-2041", status: "active",    at: hrs(0),   note: "In progress" },
      { reference: "DLV-2029", status: "completed", at: hrs(-4),  note: "Delivered on time" },
      { reference: "DLV-2019", status: "completed", at: hrs(-26), note: "Delivered on time" },
      { reference: "DLV-2002", status: "completed", at: hrs(-50), note: "Delivered on time" },
    ],
    d3: [
      { reference: "DLV-2039", status: "active",    at: hrs(-1),  note: "In transit" },
      { reference: "DLV-2028", status: "completed", at: hrs(-15), note: "Delivered on time" },
      { reference: "DLV-2011", status: "completed", at: hrs(-40), note: "Delivered, 12m late" },
    ],
    d4: [
      { reference: "DLV-2040", status: "active",    at: hrs(-3),  note: "Assigned" },
      { reference: "DLV-2032", status: "active",    at: hrs(-7),  note: "In transit" },
      { reference: "DLV-2014", status: "completed", at: hrs(-30), note: "Delivered on time" },
    ],
  };

  // Users (admin screen)
  const users = [
    { id: "u1", name: "Dana Okafor",  email: "dana.okafor@logidash.io",  role: "admin",      status: "active",   lastActive: "2m ago" },
    { id: "u2", name: "Jordan Lee",   email: "jordan.lee@logidash.io",   role: "dispatcher", status: "active",   lastActive: "just now" },
    { id: "u3", name: "Sam Whitfield",email: "sam.w@logidash.io",        role: "dispatcher", status: "active",   lastActive: "18m ago" },
    { id: "u4", name: "Marcus Webb",  email: "marcus.webb@logidash.io",  role: "driver",     status: "active",   lastActive: "5m ago" },
    { id: "u5", name: "Priya Anand",  email: "priya.anand@logidash.io",  role: "driver",     status: "active",   lastActive: "1h ago" },
    { id: "u6", name: "Ren Tanaka",   email: "ren.tanaka@logidash.io",   role: "viewer",     status: "active",   lastActive: "3h ago" },
    { id: "u7", name: "Old Account",  email: "former.user@logidash.io",  role: "viewer",     status: "disabled", lastActive: "41d ago" },
  ];

  // Demo accounts for the login screen + role switcher
  const demoAccounts = [
    { role: "admin",      name: "Dana Okafor", email: "dana.okafor@logidash.io" },
    { role: "dispatcher", name: "Jordan Lee",  email: "jordan.lee@logidash.io" },
    { role: "driver",     name: "Marcus Webb", email: "marcus.webb@logidash.io" },
    { role: "viewer",     name: "Ren Tanaka",  email: "ren.tanaka@logidash.io" },
  ];

  // Delivery lifecycle transitions
  const transitions = {
    draft:      ["ready", "cancelled"],
    ready:      ["assigned", "cancelled"],
    assigned:   ["picked_up", "ready", "cancelled"],
    picked_up:  ["in_transit", "failed", "cancelled"],
    in_transit: ["delivered", "failed"],
    delivered:  [],
    failed:     [],
    cancelled:  [],
  };

  window.DB = {
    zones, vehicleTypes, vehicles, drivers, deliveries,
    routeEstimate, recommendationRun, recommendationCandidates,
    auditByDelivery, assignmentHistory, users, demoAccounts, transitions, WEIGHTS,
    now,
    zoneById: (id) => zones.find((z) => z.id === id),
    driverById: (id) => drivers.find((d) => d.id === id),
    vehicleById: (id) => vehicles.find((v) => v.id === id),
    deliveryById: (id) => deliveries.find((d) => d.id === id),
  };
})();
