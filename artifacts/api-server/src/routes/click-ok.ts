import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateBusinessBody,
  CreateBusinessResponse,
  CreateCategoryBody,
  CreateCategoryParams,
  CreateCategoryResponse,
  CreateProductBody,
  CreateProductParams,
  CreateProductResponse,
  DeleteCategoryParams,
  DeleteProductParams,
  GetDashboardParams,
  GetDashboardResponse,
  ListBusinessesResponse,
  ListCategoriesParams,
  ListCategoriesResponse,
  ListOrdersParams,
  ListOrdersResponse,
  ListProductsParams,
  ListProductsResponse,
  UpdateCategoryBody,
  UpdateCategoryParams,
  UpdateCategoryResponse,
  UpdateOrderStatusBody,
  UpdateOrderStatusParams,
  UpdateOrderStatusResponse,
  UpdateProductBody,
  UpdateProductParams,
  UpdateProductResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

type AuthorizedClient =
  | { client: SupabaseClient }
  | { status: 401 | 503; error: string };

type BusinessRow = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  created_at: string;
};

type CategoryRow = {
  id: string;
  business_id: string;
  name: string;
  sort_order: number;
  active: boolean;
  created_at: string;
};

type ProductRow = {
  id: string;
  business_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price_cop: number;
  available: boolean;
  featured: boolean;
  created_at: string;
};

type OrderRow = {
  id: string;
  business_id: string;
  order_number: number;
  customer_name: string;
  total_cop: number;
  status: string;
  created_at: string;
};

const categoryColumns =
  "id,business_id,name,sort_order,active,created_at";
const productColumns =
  "id,business_id,category_id,name,description,price_cop,available,featured,created_at";
const orderColumns =
  "id,business_id,order_number,customer_name,total_cop,status,created_at";
type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "on_the_way"
  | "delivered"
  | "cancelled";

function mapBusiness(row: BusinessRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    currency: row.currency,
    createdAt: new Date(row.created_at),
  };
}

function mapCategory(row: CategoryRow) {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    sortOrder: row.sort_order,
    active: row.active,
    createdAt: new Date(row.created_at),
  };
}

function mapProduct(row: ProductRow) {
  return {
    id: row.id,
    businessId: row.business_id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    priceCop: row.price_cop,
    available: row.available,
    featured: row.featured,
    createdAt: new Date(row.created_at),
  };
}

function mapOrder(row: OrderRow) {
  return {
    id: row.id,
    businessId: row.business_id,
    orderNumber: row.order_number,
    customerName: row.customer_name,
    totalCop: row.total_cop,
    status: row.status,
    createdAt: new Date(row.created_at),
  };
}

async function getAuthorizedClient(req: Request): Promise<AuthorizedClient> {
  const projectUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!projectUrl || !anonKey) {
    return {
      status: 503,
      error: "Supabase is not configured for the API server.",
    };
  }

  const authorization = req.header("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return { status: 401, error: "A signed-in session is required." };
  }

  const client = createClient(projectUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    return { status: 401, error: "The session is invalid or has expired." };
  }

  return { client };
}

function respondWithAuthError(res: Response, auth: AuthorizedClient): void {
  if ("status" in auth) {
    res.status(auth.status).json({ error: auth.error });
  }
}

function respondWithDatabaseError(
  req: Request,
  res: Response,
  error: { code?: string },
  operation: string,
): void {
  const code = error.code;
  req.log.warn({ code, operation }, "Supabase request failed");

  if (code === "42501") {
    res.status(403).json({ error: "You do not have permission for this action." });
    return;
  }
  if (code === "P0002") {
    res.status(404).json({ error: "The requested record was not found." });
    return;
  }
  if (code === "22023") {
    res.status(400).json({ error: "The requested operation is not valid for the current record state." });
    return;
  }
  if (code === "23505" || code === "23503" || code === "23514") {
    res.status(400).json({ error: "The submitted data conflicts with existing records." });
    return;
  }
  res.status(503).json({ error: "The data service is temporarily unavailable." });
}

function colombiaDayRange(offsetDays = 0): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const start = new Date(
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day) + offsetDays,
      5,
    ),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

router.get("/click-ok/businesses", async (req, res): Promise<void> => {
  const auth = await getAuthorizedClient(req);
  if ("status" in auth) {
    respondWithAuthError(res, auth);
    return;
  }

  const { data, error } = await auth.client
    .from("businesses")
    .select("id,name,slug,currency,created_at")
    .order("created_at", { ascending: true });

  if (error) {
    respondWithDatabaseError(req, res, error, "list-businesses");
    return;
  }
  res.json(ListBusinessesResponse.parse((data ?? []).map(mapBusiness)));
});

router.post("/click-ok/businesses", async (req, res): Promise<void> => {
  const auth = await getAuthorizedClient(req);
  if ("status" in auth) {
    respondWithAuthError(res, auth);
    return;
  }
  const input = CreateBusinessBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.message });
    return;
  }

  const { data, error } = await auth.client.rpc("create_business", {
    p_name: input.data.name,
    p_slug: input.data.slug,
  });
  if (error) {
    respondWithDatabaseError(req, res, error, "create-business");
    return;
  }
  const row = (Array.isArray(data) ? data[0] : data) as BusinessRow | null;
  if (!row) {
    res.status(503).json({ error: "The business could not be created." });
    return;
  }
  res.status(201).json(CreateBusinessResponse.parse(mapBusiness(row)));
});

router.get(
  "/click-ok/businesses/:businessId/categories",
  async (req, res): Promise<void> => {
    const auth = await getAuthorizedClient(req);
    if ("status" in auth) {
      respondWithAuthError(res, auth);
      return;
    }
    const params = ListCategoriesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const { data, error } = await auth.client
      .from("categories")
      .select(categoryColumns)
      .eq("business_id", params.data.businessId)
      .order("sort_order")
      .order("created_at");
    if (error) {
      respondWithDatabaseError(req, res, error, "list-categories");
      return;
    }
    res.json(ListCategoriesResponse.parse((data ?? []).map(mapCategory)));
  },
);

router.post(
  "/click-ok/businesses/:businessId/categories",
  async (req, res): Promise<void> => {
    const auth = await getAuthorizedClient(req);
    if ("status" in auth) {
      respondWithAuthError(res, auth);
      return;
    }
    const params = CreateCategoryParams.safeParse(req.params);
    const input = CreateCategoryBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!input.success) {
      res.status(400).json({ error: input.error.message });
      return;
    }

    const { data, error } = await auth.client
      .from("categories")
      .insert({
        business_id: params.data.businessId,
        name: input.data.name.trim(),
        sort_order: input.data.sortOrder ?? 0,
      })
      .select(categoryColumns)
      .single();
    if (error) {
      respondWithDatabaseError(req, res, error, "create-category");
      return;
    }
    res.status(201).json(CreateCategoryResponse.parse(mapCategory(data)));
  },
);

router.patch(
  "/click-ok/categories/:categoryId",
  async (req, res): Promise<void> => {
    const auth = await getAuthorizedClient(req);
    if ("status" in auth) {
      respondWithAuthError(res, auth);
      return;
    }
    const params = UpdateCategoryParams.safeParse(req.params);
    const input = UpdateCategoryBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!input.success) {
      res.status(400).json({ error: input.error.message });
      return;
    }
    if (Object.keys(input.data).length === 0) {
      res.status(400).json({ error: "Provide at least one category field to update." });
      return;
    }

    const update: {
      name?: string;
      sort_order?: number;
      active?: boolean;
    } = {};
    if (input.data.name !== undefined) update.name = input.data.name.trim();
    if (input.data.sortOrder !== undefined) update.sort_order = input.data.sortOrder;
    if (input.data.active !== undefined) update.active = input.data.active;

    const { data, error } = await auth.client
      .from("categories")
      .update(update)
      .eq("id", params.data.categoryId)
      .select(categoryColumns)
      .maybeSingle();
    if (error) {
      respondWithDatabaseError(req, res, error, "update-category");
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Category not found." });
      return;
    }
    res.json(UpdateCategoryResponse.parse(mapCategory(data)));
  },
);

router.delete(
  "/click-ok/categories/:categoryId",
  async (req, res): Promise<void> => {
    const auth = await getAuthorizedClient(req);
    if ("status" in auth) {
      respondWithAuthError(res, auth);
      return;
    }
    const params = DeleteCategoryParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const { data, error } = await auth.client
      .from("categories")
      .delete()
      .eq("id", params.data.categoryId)
      .select("id")
      .maybeSingle();
    if (error) {
      respondWithDatabaseError(req, res, error, "delete-category");
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Category not found." });
      return;
    }
    res.sendStatus(204);
  },
);

router.get(
  "/click-ok/businesses/:businessId/products",
  async (req, res): Promise<void> => {
    const auth = await getAuthorizedClient(req);
    if ("status" in auth) {
      respondWithAuthError(res, auth);
      return;
    }
    const params = ListProductsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const { data, error } = await auth.client
      .from("products")
      .select(productColumns)
      .eq("business_id", params.data.businessId)
      .order("created_at", { ascending: false });
    if (error) {
      respondWithDatabaseError(req, res, error, "list-products");
      return;
    }
    res.json(ListProductsResponse.parse((data ?? []).map(mapProduct)));
  },
);

router.post(
  "/click-ok/businesses/:businessId/products",
  async (req, res): Promise<void> => {
    const auth = await getAuthorizedClient(req);
    if ("status" in auth) {
      respondWithAuthError(res, auth);
      return;
    }
    const params = CreateProductParams.safeParse(req.params);
    const input = CreateProductBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!input.success) {
      res.status(400).json({ error: input.error.message });
      return;
    }

    const { data, error } = await auth.client
      .from("products")
      .insert({
        business_id: params.data.businessId,
        category_id: input.data.categoryId ?? null,
        name: input.data.name.trim(),
        description: input.data.description ?? null,
        price_cop: input.data.priceCop,
        available: input.data.available ?? true,
        featured: input.data.featured ?? false,
      })
      .select(productColumns)
      .single();
    if (error) {
      respondWithDatabaseError(req, res, error, "create-product");
      return;
    }
    res.status(201).json(CreateProductResponse.parse(mapProduct(data)));
  },
);

router.patch(
  "/click-ok/products/:productId",
  async (req, res): Promise<void> => {
    const auth = await getAuthorizedClient(req);
    if ("status" in auth) {
      respondWithAuthError(res, auth);
      return;
    }
    const params = UpdateProductParams.safeParse(req.params);
    const input = UpdateProductBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!input.success) {
      res.status(400).json({ error: input.error.message });
      return;
    }
    if (Object.keys(input.data).length === 0) {
      res.status(400).json({ error: "Provide at least one product field to update." });
      return;
    }

    const update: {
      category_id?: string | null;
      name?: string;
      description?: string | null;
      price_cop?: number;
      available?: boolean;
      featured?: boolean;
    } = {};
    if (input.data.categoryId !== undefined) update.category_id = input.data.categoryId;
    if (input.data.name !== undefined) update.name = input.data.name.trim();
    if (input.data.description !== undefined) update.description = input.data.description;
    if (input.data.priceCop !== undefined) update.price_cop = input.data.priceCop;
    if (input.data.available !== undefined) update.available = input.data.available;
    if (input.data.featured !== undefined) update.featured = input.data.featured;

    const { data, error } = await auth.client
      .from("products")
      .update(update)
      .eq("id", params.data.productId)
      .select(productColumns)
      .maybeSingle();
    if (error) {
      respondWithDatabaseError(req, res, error, "update-product");
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Product not found." });
      return;
    }
    res.json(UpdateProductResponse.parse(mapProduct(data)));
  },
);

router.delete(
  "/click-ok/products/:productId",
  async (req, res): Promise<void> => {
    const auth = await getAuthorizedClient(req);
    if ("status" in auth) {
      respondWithAuthError(res, auth);
      return;
    }
    const params = DeleteProductParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const { data, error } = await auth.client
      .from("products")
      .delete()
      .eq("id", params.data.productId)
      .select("id")
      .maybeSingle();
    if (error) {
      respondWithDatabaseError(req, res, error, "delete-product");
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Product not found." });
      return;
    }
    res.sendStatus(204);
  },
);

router.get(
  "/click-ok/businesses/:businessId/orders",
  async (req, res): Promise<void> => {
    const auth = await getAuthorizedClient(req);
    if ("status" in auth) {
      respondWithAuthError(res, auth);
      return;
    }
    const params = ListOrdersParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const { data, error } = await auth.client
      .from("orders")
      .select(orderColumns)
      .eq("business_id", params.data.businessId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      respondWithDatabaseError(req, res, error, "list-orders");
      return;
    }
    res.json(ListOrdersResponse.parse((data ?? []).map(mapOrder)));
  },
);

const allowedTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["on_the_way", "delivered"],
  on_the_way: ["delivered"],
  delivered: [],
  cancelled: [],
};

router.patch(
  "/click-ok/orders/:orderId/status",
  async (req, res): Promise<void> => {
    const auth = await getAuthorizedClient(req);
    if ("status" in auth) {
      respondWithAuthError(res, auth);
      return;
    }
    const params = UpdateOrderStatusParams.safeParse(req.params);
    const input = UpdateOrderStatusBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!input.success) {
      res.status(400).json({ error: input.error.message });
      return;
    }

    const { data: existing, error: findError } = await auth.client
      .from("orders")
      .select(orderColumns)
      .eq("id", params.data.orderId)
      .maybeSingle();
    if (findError) {
      respondWithDatabaseError(req, res, findError, "find-order");
      return;
    }
    if (!existing) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    const currentStatus = existing.status as OrderStatus;
    if (
      input.data.status !== currentStatus &&
      !allowedTransitions[currentStatus]?.includes(input.data.status)
    ) {
      res.status(400).json({
        error: "That order status change is not allowed.",
      });
      return;
    }
    if (input.data.status === currentStatus) {
      res.json(UpdateOrderStatusResponse.parse(mapOrder(existing)));
      return;
    }

    const { data, error } = await auth.client.rpc("advance_order_status", {
      p_order_id: params.data.orderId,
      p_status: input.data.status,
    });
    if (error) {
      respondWithDatabaseError(req, res, error, "update-order-status");
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as OrderRow | null;
    if (!row) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    res.json(UpdateOrderStatusResponse.parse(mapOrder(row)));
  },
);

router.get(
  "/click-ok/businesses/:businessId/dashboard",
  async (req, res): Promise<void> => {
    const auth = await getAuthorizedClient(req);
    if ("status" in auth) {
      respondWithAuthError(res, auth);
      return;
    }
    const params = GetDashboardParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const { start, end } = colombiaDayRange();
    const previousDay = colombiaDayRange(-1);
    const businessId = params.data.businessId;
    const [
      todayOrdersResult,
      previousOrdersResult,
      pendingResult,
      productsResult,
      customersResult,
      recentOrdersResult,
    ] = await Promise.all([
      auth.client
        .from("orders")
        .select("total_cop,status")
        .eq("business_id", businessId)
        .gte("created_at", start)
        .lt("created_at", end),
      auth.client
        .from("orders")
        .select("total_cop,status")
        .eq("business_id", businessId)
        .gte("created_at", previousDay.start)
        .lt("created_at", previousDay.end),
      auth.client
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .in("status", ["pending", "confirmed", "preparing", "ready", "on_the_way"]),
      auth.client
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId),
      auth.client
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId),
      auth.client
        .from("orders")
        .select(orderColumns)
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

    const firstError = [
      todayOrdersResult.error,
      previousOrdersResult.error,
      pendingResult.error,
      productsResult.error,
      customersResult.error,
      recentOrdersResult.error,
    ].find(Boolean);
    if (firstError) {
      respondWithDatabaseError(req, res, firstError, "dashboard");
      return;
    }

    const todayOrders = todayOrdersResult.data ?? [];
    const previousOrders = previousOrdersResult.data ?? [];
    const result = {
      salesTodayCop: todayOrders
        .filter((order) => order.status === "delivered")
        .reduce((total, order) => total + order.total_cop, 0),
      salesPreviousDayCop: previousOrders
        .filter((order) => order.status === "delivered")
        .reduce((total, order) => total + order.total_cop, 0),
      ordersToday: todayOrders.length,
      pendingOrders: pendingResult.count ?? 0,
      productsCount: productsResult.count ?? 0,
      customersCount: customersResult.count ?? 0,
      recentOrders: (recentOrdersResult.data ?? []).map(mapOrder),
    };
    res.json(GetDashboardResponse.parse(result));
  },
);


// Operational endpoints backed by SECURITY DEFINER RPCs and business-scoped RLS.
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

router.get("/click-ok/businesses/:businessId/inventory-movements", async (req, res): Promise<void> => {
  const auth = await getAuthorizedClient(req);
  if ("status" in auth) { respondWithAuthError(res, auth); return; }
  const businessId = req.params.businessId;
  if (!validUuid(businessId)) { res.status(400).json({ error: "Invalid business identifier." }); return; }
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const { data, error } = await auth.client
    .from("inventory_movements")
    .select("id,business_id,product_id,movement_type,quantity,stock_before,stock_after,note,reference_type,reference_id,created_by,created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) { respondWithDatabaseError(req, res, error, "list-inventory-movements"); return; }
  res.json(data ?? []);
});

router.post("/click-ok/products/:productId/inventory-movements", async (req, res): Promise<void> => {
  const auth = await getAuthorizedClient(req);
  if ("status" in auth) { respondWithAuthError(res, auth); return; }
  if (!validUuid(req.params.productId)) { res.status(400).json({ error: "Invalid product identifier." }); return; }
  const { movementType, quantity, note, referenceType } = req.body ?? {};
  if (!["in", "out", "adjustment"].includes(movementType)
    || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000
    || (note !== undefined && note !== null && (typeof note !== "string" || note.length > 500))
    || (referenceType !== undefined && !["manual", "purchase", "sale", "return", "correction"].includes(referenceType))) {
    res.status(400).json({ error: "Invalid inventory movement details." }); return;
  }
  const { data, error } = await auth.client.rpc("adjust_product_stock", {
    p_product_id: req.params.productId,
    p_movement_type: movementType,
    p_quantity: quantity,
    p_note: note ?? null,
    p_reference_type: referenceType ?? "manual",
  });
  if (error) { respondWithDatabaseError(req, res, error, "adjust-product-stock"); return; }
  res.status(201).json(data);
});

router.get("/click-ok/businesses/:businessId/cash-sessions", async (req, res): Promise<void> => {
  const auth = await getAuthorizedClient(req);
  if ("status" in auth) { respondWithAuthError(res, auth); return; }
  const businessId = req.params.businessId;
  if (!validUuid(businessId)) { res.status(400).json({ error: "Invalid business identifier." }); return; }
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const { data, error } = await auth.client
    .from("cash_sessions")
    .select("id,business_id,opened_by,closed_by,opening_amount_cop,closing_amount_cop,expected_amount_cop,difference_cop,status,notes,opened_at,closed_at")
    .eq("business_id", businessId)
    .order("opened_at", { ascending: false })
    .limit(limit);
  if (error) { respondWithDatabaseError(req, res, error, "list-cash-sessions"); return; }
  res.json(data ?? []);
});

router.post("/click-ok/businesses/:businessId/cash-sessions", async (req, res): Promise<void> => {
  const auth = await getAuthorizedClient(req);
  if ("status" in auth) { respondWithAuthError(res, auth); return; }
  const businessId = req.params.businessId;
  const { openingAmountCop, notes } = req.body ?? {};
  if (!validUuid(businessId) || !Number.isSafeInteger(openingAmountCop)
    || openingAmountCop < 0 || openingAmountCop > 2000000000
    || (notes !== undefined && notes !== null && (typeof notes !== "string" || notes.length > 1000))) {
    res.status(400).json({ error: "Invalid cash session details." }); return;
  }
  const { data, error } = await auth.client.rpc("open_cash_session", {
    p_business_id: businessId,
    p_opening_amount_cop: openingAmountCop,
    p_notes: notes ?? null,
  });
  if (error) { respondWithDatabaseError(req, res, error, "open-cash-session"); return; }
  res.status(201).json(data);
});

router.post("/click-ok/cash-sessions/:sessionId/movements", async (req, res): Promise<void> => {
  const auth = await getAuthorizedClient(req);
  if ("status" in auth) { respondWithAuthError(res, auth); return; }
  const { movementType, amountCop, description, referenceId } = req.body ?? {};
  if (!validUuid(req.params.sessionId)
    || !["sale", "income", "expense", "refund"].includes(movementType)
    || !Number.isSafeInteger(amountCop) || amountCop < 1 || amountCop > 2000000000
    || typeof description !== "string" || description.trim().length < 1 || description.length > 240
    || (referenceId !== undefined && referenceId !== null && !validUuid(referenceId))) {
    res.status(400).json({ error: "Invalid cash movement details." }); return;
  }
  const { data, error } = await auth.client.rpc("record_cash_movement", {
    p_session_id: req.params.sessionId,
    p_movement_type: movementType,
    p_amount_cop: amountCop,
    p_description: description.trim(),
    p_reference_id: referenceId ?? null,
  });
  if (error) { respondWithDatabaseError(req, res, error, "record-cash-movement"); return; }
  res.status(201).json(data);
});

router.post("/click-ok/cash-sessions/:sessionId/close", async (req, res): Promise<void> => {
  const auth = await getAuthorizedClient(req);
  if ("status" in auth) { respondWithAuthError(res, auth); return; }
  const { closingAmountCop, notes } = req.body ?? {};
  if (!validUuid(req.params.sessionId)
    || !Number.isSafeInteger(closingAmountCop) || closingAmountCop < 0 || closingAmountCop > 2000000000
    || (notes !== undefined && notes !== null && (typeof notes !== "string" || notes.length > 1000))) {
    res.status(400).json({ error: "Invalid cash closing details." }); return;
  }
  const { data, error } = await auth.client.rpc("close_cash_session", {
    p_session_id: req.params.sessionId,
    p_closing_amount_cop: closingAmountCop,
    p_notes: notes ?? null,
  });
  if (error) { respondWithDatabaseError(req, res, error, "close-cash-session"); return; }
  res.json(data);
});

export default router;
