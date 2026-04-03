import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

// Custom metric to track failures
const failRate = new Rate("failed_requests");

// Spike test scenario: simulate 500 users submitting at the same moment
export const options = {
  scenarios: {
    spike: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "3s", target: 500 },   // Ramp up to 500 VUs in 3s
        { duration: "10s", target: 500 },   // Hold at 500 VUs for 10s
        { duration: "3s", target: 0 },      // Ramp down to 0 in 3s
      ],
      gracefulRampDown: "5s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],          // Less than 1% failure rate
    http_req_duration: ["p(95)<10000"],      // 95% of requests under 10s (local server)
    failed_requests: ["rate<0.01"],          // Less than 1% custom failures
  },
};

// Generate a realistic exam submission payload
function generatePayload(vuId) {
  const answers = {};
  for (let i = 1; i <= 50; i++) {
    const options = ["A", "B", "C", "D"];
    answers[i] = options[Math.floor(Math.random() * 4)];
  }

  return JSON.stringify({
    userId: `VU-${vuId}-${Date.now().toString(36).toUpperCase()}`,
    answers: answers,
    timestamp: Date.now(),
    examDuration: Math.floor(Math.random() * 1800), // 0-1800 seconds
  });
}

export default function () {
  const payload = generatePayload(__VU);

  const params = {
    headers: {
      "Content-Type": "application/json",
    },
    timeout: "30s",
  };

  const res = http.post("http://localhost:3000/api/submit", payload, params);

  const success = check(res, {
    "status is 200": (r) => r.status === 200,
    "response has success field": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true;
      } catch {
        return false;
      }
    },
    "response has submissionId": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.submissionId && body.submissionId.length > 0;
      } catch {
        return false;
      }
    },
  });

  failRate.add(!success);

  // Small sleep to simulate slightly staggered submissions
  sleep(Math.random() * 0.5);
}
