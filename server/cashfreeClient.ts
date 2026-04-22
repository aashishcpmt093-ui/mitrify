const API_VERSION = "2023-08-01";

function getBaseUrl(): string {
  const isProduction = process.env.REPLIT_DEPLOYMENT === "1";
  return isProduction
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
}

function getHeaders(): Record<string, string> {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;
  if (!appId || !secretKey) {
    throw new Error("Cashfree credentials not configured");
  }
  return {
    "Content-Type": "application/json",
    "x-client-id": appId,
    "x-client-secret": secretKey,
    "x-api-version": API_VERSION,
  };
}

export interface CashfreeOrderResponse {
  cf_order_id: string;
  order_id: string;
  payment_session_id: string;
  order_status: string;
  payment_link?: string;
}

export async function createCashfreeOrder(params: {
  orderId: string;
  amount: number;
  currency?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  returnUrl: string;
  orderNote?: string;
  orderTags?: Record<string, string>;
}): Promise<CashfreeOrderResponse> {
  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}/orders`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      order_id: params.orderId,
      order_amount: params.amount,
      order_currency: params.currency || "INR",
      customer_details: {
        customer_id: params.orderId.split("_")[0],
        customer_name: params.customerName || "Customer",
        customer_email: params.customerEmail || "customer@mitrify.com",
        customer_phone: params.customerPhone || "9999999999",
      },
      order_meta: {
        return_url: params.returnUrl,
        notify_url: null,
      },
      order_note: params.orderNote || "",
      order_tags: params.orderTags || {},
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error("Cashfree create order error:", error);
    throw new Error(error.message || `Cashfree API error: ${response.status}`);
  }

  const data = await response.json();
  console.log("Cashfree order created:", JSON.stringify(data));
  return data;
}

export async function verifyCashfreePayment(orderId: string): Promise<CashfreeOrderResponse> {
  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}/orders/${orderId}`, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error("Cashfree verify error:", error);
    throw new Error(error.message || `Cashfree API error: ${response.status}`);
  }

  return response.json();
}
