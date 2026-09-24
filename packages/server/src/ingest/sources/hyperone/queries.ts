/**
 * HyperOne Magento 2 GraphQL documents (§catalog import, stage 1).
 *
 * EVERY FIELD HERE IS PROBE-VERIFIED AGAINST THE LIVE ENDPOINT. Magento fails the WHOLE
 * query on a single invalid field, so this file is the one place the selection set lives and
 * adding to it requires a probe first. Known traps, all hit during discovery:
 *
 *   - `custom_attributesV2` and `labels` → "Internal server error" on this instance.
 *   - `product_featured_attributes` and `labels` are `[String]`, NOT object lists — a sub
 *     selection on them is a hard error.
 *   - `weight` is NOT on ProductInterface; it needs the PhysicalProductInterface fragment.
 *   - `brand` is an object exposing only `name` (no `uid`).
 *   - `categories` accepts no `category_url_key` filter — it is `category_url_path`,
 *     `category_uid` or `category_id`.
 *
 * Bilingual data comes from the `Store` header, not from the query: `Store: default` is the
 * en_US store view and `Store: ar_EG` is Arabic. Identical SKUs in both, so EN and AR join
 * on `sku` during normalize.
 */

/** The full category tree. 289 nodes across 5 levels as of discovery. */
export const CATEGORY_TREE = /* GraphQL */ `
  query RagabCategoryTree {
    categories(filters: {}, pageSize: 400) {
      total_count
      items {
        uid
        id
        name
        url_key
        url_path
        level
        position
        include_in_menu
        product_count
        image
        children_count
      }
    }
  }
`;

/** Shared product selection. Keep this as ONE constant — see the header. */
const PRODUCT_FIELDS = /* GraphQL */ `
  fragment ProductFields on ProductInterface {
    uid
    id
    sku
    name
    url_key
    stock_status
    special_price
    meta_title
    meta_description
    image {
      url
      label
    }
    media_gallery {
      url
      label
      position
    }
    price_range {
      minimum_price {
        regular_price {
          value
          currency
        }
        final_price {
          value
          currency
        }
        discount {
          percent_off
          amount_off
        }
      }
    }
    categories {
      uid
      id
      name
      url_path
      level
    }
    ... on PhysicalProductInterface {
      weight
    }
  }
`;

/**
 * The whole-catalog sweep: ONE ~29-page pass per store view instead of 289 category crawls.
 *
 * THE FILTER FORM MATTERS AND IS COUNTER-INTUITIVE. Measured against the live endpoint:
 *
 *     search: "" + filter: {}        → 8506   ← widest, what we use
 *     filter: {} alone               → 8386
 *     filter: { price: { from: "0" } } → 0     ← Magento matches NOTHING for "0"
 *     filter: { price: { from: "0.01" } } → 8386
 *     filter: { category_id: { eq: "2" } } → 8386   (root, recursive)
 *
 * `price: { from: "0" }` looks like the obvious universal predicate and is silently empty —
 * which is exactly what the preflight guard in fetch.ts exists to catch.
 *
 * `sort` is MANDATORY: without a stable sort, Magento's deep paging returns overlapping and
 * missing rows. Verified with `sort: { name: ASC }` at pageSize 300: 29 pages, 8506 unique
 * SKUs, 0 duplicates, 0 missing.
 */
export const PRODUCT_SWEEP = /* GraphQL */ `
  ${PRODUCT_FIELDS}
  query RagabProductSweep($page: Int!, $pageSize: Int!) {
    products(
      search: ""
      filter: {}
      pageSize: $pageSize
      currentPage: $page
      sort: { name: ASC }
    ) {
      total_count
      page_info {
        current_page
        page_size
        total_pages
      }
      items {
        ...ProductFields
      }
    }
  }
`;

/** Fallback when the sweep preflight undercounts — crawl the 38 level-2 paths instead. */
export const PRODUCTS_BY_CATEGORY = /* GraphQL */ `
  ${PRODUCT_FIELDS}
  query RagabProductsByCategory($path: String!, $page: Int!, $pageSize: Int!) {
    products(
      filter: { category_url_path: { eq: $path } }
      pageSize: $pageSize
      currentPage: $page
      sort: { name: ASC }
    ) {
      total_count
      page_info {
        current_page
        page_size
        total_pages
      }
      items {
        ...ProductFields
      }
    }
  }
`;

/**
 * Cheap count, to validate the sweep filter before committing to a 29-page pass. MUST use
 * the identical filter form as PRODUCT_SWEEP or it validates nothing.
 */
export const SWEEP_PREFLIGHT = /* GraphQL */ `
  query RagabSweepPreflight {
    products(search: "", filter: {}, pageSize: 1, currentPage: 1) {
      total_count
    }
  }
`;

/** Store views, so the fetcher can assert the two it expects still exist. */
export const AVAILABLE_STORES = /* GraphQL */ `
  query RagabStores {
    availableStores {
      store_code
      store_name
      locale
      is_default_store
    }
  }
`;

/** Run by hand before adding `brand { name }` to PRODUCT_FIELDS — see the header. */
export const BRAND_PROBE = /* GraphQL */ `
  query RagabBrandProbe($sku: String!) {
    products(filter: { sku: { eq: $sku } }, pageSize: 1) {
      items {
        sku
        ... on SimpleProduct {
          brand {
            name
          }
          manufacturer
        }
      }
    }
  }
`;
