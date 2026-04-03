import { NextRequest, NextResponse } from "next/server";

// Disable body size limit for this route
export const runtime = "nodejs";

/**
 * POST /api/submit
 * Mock exam submission endpoint
 * Simulates 50ms DB insertion delay (optimized for spike)
 */
export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON" },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!body.userId || !body.answers || !body.timestamp) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Simulate database insertion delay (50ms - optimized)
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Generate a mock submission ID
    const submissionId = `SUB-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()}`;

    return NextResponse.json({
      success: true,
      submissionId,
      receivedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[SUBMIT ERROR]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
