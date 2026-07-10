/**
 * API Service Layer
 * Handles all communication with the backend REST API
 */

import { DEPLOYMENT } from "../config/deployment";

const API_BASE = DEPLOYMENT.apiUrl;

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...options,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  config.signal = controller.signal;

  try {
    const response = await fetch(url, config);
    clearTimeout(timeout);

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        data.error || `Request failed with status ${response.status}`,
        response.status,
        data
      );
    }

    return data;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new ApiError("Request timed out. Please check your connection.", 0);
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      "Unable to connect to the server. Please ensure the backend is running.",
      0
    );
  }
}

export const api = {
  /** Health check */
  health: () => request("/api/health"),

  /** Fetch all students */
  getStudents: () => request("/api/students"),

  /** Enroll a student for voting (sends enrollment commitment) */
  enrollStudent: (matricNumber, enrollmentCommitment) =>
    request("/api/enroll", {
      method: "POST",
      body: JSON.stringify({ matricNumber, enrollmentCommitment }),
    }),

  /** Verify eligibility and generate ZKP */
  verifyStudent: (matricNumber, electionId) =>
    request("/api/verify", {
      method: "POST",
      body: JSON.stringify({ matricNumber, electionId }),
    }),

  /** Get election info */
  getElection: (id) => request(`/api/election/${id}`),

  /** Get all enrollment commitments */
  getEnrollmentCommitments: () => request("/api/enrollment-commitments"),
};
