import { z } from 'zod';
import { insertProfileSchema, insertProviderSchema, insertCallSchema, insertPromoCodeSchema } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
};

export const api = {
  profiles: {
    me: {
      method: 'GET' as const,
      path: '/api/profiles/me' as const,
      responses: {
        200: z.custom<any>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/profiles' as const,
      input: insertProfileSchema,
      responses: {
        201: z.custom<any>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/profiles/me' as const,
      input: insertProfileSchema.partial(),
      responses: {
        200: z.custom<any>(),
        400: errorSchemas.validation,
      },
    },
  },
  providers: {
    search: {
      method: 'GET' as const,
      path: '/api/providers/search' as const,
      input: z.object({
        query: z.string().optional(),
        lat: z.string().optional(),
        lng: z.string().optional(),
        radius: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<any>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/providers/:id' as const,
      responses: {
        200: z.custom<any>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/providers' as const,
      input: insertProviderSchema,
      responses: {
        201: z.custom<any>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/providers/me' as const,
      input: insertProviderSchema.partial(),
      responses: {
        200: z.custom<any>(),
        400: errorSchemas.validation,
      },
    },
    myProfile: {
      method: 'GET' as const,
      path: '/api/providers/me' as const,
      responses: {
        200: z.custom<any>(),
        404: errorSchemas.notFound,
      },
    },
  },
  calls: {
    create: {
      method: 'POST' as const,
      path: '/api/calls' as const,
      input: z.object({
        providerId: z.string(),
      }),
      responses: {
        201: z.custom<any>(),
        400: errorSchemas.validation,
        402: z.object({ message: z.string(), requiresPayment: z.boolean() }),
      },
    },
    customerHistory: {
      method: 'GET' as const,
      path: '/api/calls/customer' as const,
      responses: {
        200: z.array(z.custom<any>()),
      },
    },
    providerHistory: {
      method: 'GET' as const,
      path: '/api/calls/provider' as const,
      responses: {
        200: z.array(z.custom<any>()),
      },
    },
  },
  credits: {
    me: {
      method: 'GET' as const,
      path: '/api/credits/me' as const,
      responses: {
        200: z.object({ freeCredits: z.number(), purchasedCredits: z.number(), totalCredits: z.number() }),
      },
    },
    purchase: {
      method: 'POST' as const,
      path: '/api/credits/purchase' as const,
      input: z.object({
        role: z.enum(['customer', 'provider']),
        amount: z.number().min(1).max(1000),
      }),
      responses: {
        200: z.custom<any>(),
        400: errorSchemas.validation,
      },
    },
  },
  promoCodes: {
    apply: {
      method: 'POST' as const,
      path: '/api/promo-codes/apply' as const,
      input: z.object({
        code: z.string(),
      }),
      responses: {
        200: z.object({ message: z.string() }),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    mine: {
      method: 'GET' as const,
      path: '/api/promo-codes/mine' as const,
      responses: {
        200: z.custom<any>(),
      },
    },
  },
  admin: {
    stats: {
      method: 'GET' as const,
      path: '/api/admin/stats' as const,
      responses: {
        200: z.custom<any>(),
        403: errorSchemas.unauthorized,
      },
    },
    customers: {
      method: 'GET' as const,
      path: '/api/admin/customers' as const,
      responses: {
        200: z.array(z.custom<any>()),
      },
    },
    providers: {
      method: 'GET' as const,
      path: '/api/admin/providers' as const,
      responses: {
        200: z.array(z.custom<any>()),
      },
    },
    callLogs: {
      method: 'GET' as const,
      path: '/api/admin/call-logs' as const,
      responses: {
        200: z.array(z.custom<any>()),
      },
    },
    toggleBlock: {
      method: 'POST' as const,
      path: '/api/admin/toggle-block/:userId' as const,
      responses: {
        200: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    deleteUser: {
      method: 'DELETE' as const,
      path: '/api/admin/users/:userId' as const,
      responses: {
        200: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    promoCodes: {
      method: 'GET' as const,
      path: '/api/admin/promo-codes' as const,
      responses: {
        200: z.array(z.custom<any>()),
      },
    },
    togglePromoCode: {
      method: 'POST' as const,
      path: '/api/admin/promo-codes/:id/toggle' as const,
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
    createPromoCode: {
      method: 'POST' as const,
      path: '/api/admin/promo-codes' as const,
      input: z.object({
        code: z.string(),
      }),
      responses: {
        201: z.custom<any>(),
        400: errorSchemas.validation,
      },
    },
    exportCsv: {
      method: 'GET' as const,
      path: '/api/admin/export/:type' as const,
      responses: {
        200: z.any(),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type ProfileInput = z.infer<typeof api.profiles.create.input>;
export type ProviderInput = z.infer<typeof api.providers.create.input>;
export type CallInput = z.infer<typeof api.calls.create.input>;
export type CreditPurchaseInput = z.infer<typeof api.credits.purchase.input>;
