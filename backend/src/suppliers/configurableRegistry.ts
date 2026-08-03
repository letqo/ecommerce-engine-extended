import { ConfigurableSupplierMeta, ConfigurableSupplierKey } from './configurableTypes'

// Single source of truth describing every per-store configurable supplier: what it can do and
// what settings it needs. The admin Integrations page renders its form from `settingFields`,
// the Setup Assistant answers `list_available_suppliers` / `get_supplier_capabilities` from
// here, and the settings PUT route validates against it. Adding a supplier means: write the
// adapter, add an entry here, add the enum value — nothing else knows the list.
export const CONFIGURABLE_SUPPLIERS: Record<ConfigurableSupplierKey, ConfigurableSupplierMeta> = {
  PRINTFUL: {
    key: 'PRINTFUL',
    displayName: 'Printful',
    description:
      'Print-on-demand fulfilment (apparel, prints, accessories) with warehouses in the US, EU and beyond. Orders are submitted and confirmed automatically; shipping updates arrive by webhook.',
    docsUrl: 'https://developers.printful.com/docs/',
    capabilities: {
      search: true,
      productImport: true,
      orderSubmission: true,
      trackingPolling: true,
      webhooks: true,
      marketAvailability: true,
    },
    settingFields: [
      {
        name: 'apiToken',
        label: 'Private API token',
        help: 'Printful Dashboard → Settings → Developers → create a private token.',
        required: true,
        secret: true,
      },
      {
        name: 'storeId',
        label: 'Printful store ID',
        help: 'Only needed for account-level tokens that can see more than one Printful store.',
        required: false,
        secret: false,
      },
      {
        name: 'baseUrl',
        label: 'API base URL',
        help: 'Leave blank unless Printful tells you otherwise. Default: https://api.printful.com',
        required: false,
        secret: false,
        placeholder: 'https://api.printful.com',
      },
    ],
  },

  GELATO: {
    key: 'GELATO',
    displayName: 'Gelato',
    description:
      'Global print-on-demand with local production in 30+ countries — usually the shortest shipping distance for EU customers. Requires print-ready artwork per item.',
    docsUrl: 'https://dashboard.gelato.com/docs/',
    capabilities: {
      search: true,
      productImport: true,
      orderSubmission: true,
      trackingPolling: true,
      webhooks: false,
      marketAvailability: true,
    },
    settingFields: [
      {
        name: 'apiKey',
        label: 'API key',
        help: 'Gelato Dashboard → Developer → API keys.',
        required: true,
        secret: true,
      },
      {
        name: 'catalogUid',
        label: 'Default catalog',
        help: 'Which Gelato catalog product search browses, e.g. "posters", "apparel", "cards". Default: posters.',
        required: false,
        secret: false,
        placeholder: 'posters',
      },
    ],
  },

  BIGBUY: {
    key: 'BIGBUY',
    displayName: 'BigBuy',
    description:
      'European wholesale dropshipping catalogue (electronics, home, toys) shipped from Spain across the EU. Products are looked up by SKU — BigBuy has no keyword search API.',
    docsUrl: 'https://www.bigbuy.eu/en/api_bigbuy.html',
    capabilities: {
      // SKU lookup only, not keyword search — see BigBuyAdapter.searchProducts.
      search: false,
      productImport: true,
      orderSubmission: true,
      trackingPolling: true,
      webhooks: false,
      marketAvailability: false,
    },
    settingFields: [
      {
        name: 'apiKey',
        label: 'API key',
        help: 'Requested from BigBuy through their API access form; delivered by email.',
        required: true,
        secret: true,
      },
      {
        name: 'notificationEmail',
        label: 'Order contact email',
        help: 'BigBuy requires an email on every order. Use a mailbox you actually monitor — supplier-side delivery problems are sent here.',
        required: true,
        secret: false,
      },
      {
        name: 'paymentMethod',
        label: 'Payment method',
        help: 'Usually "moneybox" (draw from your prepaid BigBuy balance).',
        required: false,
        secret: false,
        placeholder: 'moneybox',
      },
      {
        name: 'carriers',
        label: 'Preferred carriers',
        help: 'Comma-separated carrier names in order of preference. Leave blank to let BigBuy choose.',
        required: false,
        secret: false,
      },
      {
        name: 'isoCode',
        label: 'Catalogue language',
        help: 'Two-letter language code for product titles and descriptions. Default: en.',
        required: false,
        secret: false,
        placeholder: 'en',
      },
      {
        name: 'sandbox',
        label: 'Use sandbox',
        help: 'Set to "true" to send orders to BigBuy\'s test environment instead of production.',
        required: false,
        secret: false,
        placeholder: 'false',
      },
    ],
  },

  WOO_BRIDGE: {
    key: 'WOO_BRIDGE',
    displayName: 'Custom WooCommerce Bridge',
    description:
      'Connect ANY supplier that has no ordering API of its own but runs a WooCommerce store. Orders are placed on their site over the WooCommerce REST API and tracking is read back off the order. This is the general-purpose way to onboard a new supplier without writing code.',
    docsUrl: 'https://woocommerce.github.io/woocommerce-rest-api-docs/',
    capabilities: {
      search: true,
      productImport: true,
      orderSubmission: true,
      trackingPolling: true,
      webhooks: true,
      marketAvailability: false,
    },
    settingFields: [
      {
        name: 'supplierName',
        label: 'Supplier name',
        help: 'How this supplier appears on orders and in the fulfilment queue.',
        required: true,
        secret: false,
      },
      {
        name: 'baseUrl',
        label: 'Store URL',
        help: 'The root of the supplier\'s WooCommerce site, e.g. https://supplier.example. Must be HTTPS.',
        required: true,
        secret: false,
        placeholder: 'https://supplier.example',
      },
      {
        name: 'consumerKey',
        label: 'Consumer key',
        help: 'WooCommerce → Settings → Advanced → REST API → Add key, with Read/Write permission.',
        required: true,
        secret: true,
      },
      {
        name: 'consumerSecret',
        label: 'Consumer secret',
        help: 'Shown once when the REST API key is created.',
        required: true,
        secret: true,
      },
      {
        name: 'webhookSecret',
        label: 'Webhook secret',
        help: 'Optional. Set the same value on an "Order updated" webhook in their WooCommerce admin to receive push updates instead of polling.',
        required: false,
        secret: true,
      },
    ],
  },
}

export function listConfigurableSuppliers(): ConfigurableSupplierMeta[] {
  return Object.values(CONFIGURABLE_SUPPLIERS)
}

export function getConfigurableSupplierMeta(key: ConfigurableSupplierKey): ConfigurableSupplierMeta {
  return CONFIGURABLE_SUPPLIERS[key]
}
