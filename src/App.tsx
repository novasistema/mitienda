import { FormEvent, useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebaseServices } from "./firebase";

type Product = {
  id: string;
  name: string;
  category: string;
  shortDescription: string;
  description: string;
  price: number;
  stock: number;
  images: string[];
  freeShipping: boolean;
};

type ShippingMethod = {
  id: string;
  name: string;
  eta: string;
  baseCost: number;
  freeFrom: number;
};

type CartItem = {
  productId: string;
  quantity: number;
};

type CustomerData = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  notes: string;
  marketingOptIn: boolean;
};

type Order = {
  id: string;
  createdAt: string;
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
  subtotal: number;
  shippingMethodId: string;
  shippingMethodName: string;
  shippingCost: number;
  total: number;
  paymentMethod: string;
  customer: CustomerData;
  status: "nuevo" | "contactado" | "facturado";
  documentType: "factura" | "recibo";
};

type CustomerRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  marketingOptIn: boolean;
  ordersCount: number;
  totalSpent: number;
  lastOrderAt: string;
  merchandise: string[];
};

type ThemeSettings = {
  storeName: string;
  heroLine: string;
  supportLine: string;
  primaryColor: string;
  surfaceColor: string;
  fontFamily: string;
  logoInitials: string;
  heroImage: string;
};

type ContactSettings = {
  email: string;
  phone: string;
  whatsapp: string;
  address: string;
};

type StoreData = {
  theme: ThemeSettings;
  contact: ContactSettings;
  paymentMethods: string[];
  shippingMethods: ShippingMethod[];
  products: Product[];
  orders: Order[];
  customers: CustomerRecord[];
};

type SyncStatus = "local" | "firebase-connected" | "firebase-error" | "firebase-not-configured";

const STORAGE_KEY = "multi-rubro-store-v2";

const productFallbackImage =
  "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=1100&q=80";

const defaultCustomerData: CustomerData = {
  name: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  notes: "",
  marketingOptIn: true,
};

const defaultData: StoreData = {
  theme: {
    storeName: "Mercado MultiRubro",
    heroLine: "Vende online con tu propia tienda, lista para celular",
    supportLine: "Carga productos, define pagos y envios por importe, y recibe pedidos completos.",
    primaryColor: "#1d4ed8",
    surfaceColor: "#f8fafc",
    fontFamily: "Inter, system-ui, sans-serif",
    logoInitials: "MM",
    heroImage:
      "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1600&q=80",
  },
  contact: {
    email: "ventas@multirubro.com",
    phone: "+54 11 4321 6789",
    whatsapp: "5491112345678",
    address: "Av. Comercio 1234",
  },
  paymentMethods: ["Transferencia", "Tarjeta", "Efectivo"],
  shippingMethods: [
    {
      id: "envio-domicilio",
      name: "Envio a domicilio",
      eta: "24 a 72 hs",
      baseCost: 4900,
      freeFrom: 70000,
    },
    {
      id: "mensajeria",
      name: "Mensajeria express",
      eta: "Mismo dia",
      baseCost: 6900,
      freeFrom: 110000,
    },
    {
      id: "retiro",
      name: "Retiro en local",
      eta: "Listo en 2 hs",
      baseCost: 0,
      freeFrom: 0,
    },
  ],
  products: [
    {
      id: "p-1",
      name: "Auriculares Bluetooth Pro",
      category: "Tecnologia",
      shortDescription: "Sonido premium y 30 horas de bateria.",
      description:
        "Auriculares inalambricos con cancelacion pasiva de ruido, microfono dual y carga rapida por USB-C.",
      price: 45990,
      stock: 18,
      freeShipping: false,
      images: [
        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&q=80",
        "https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&w=1000&q=80",
      ],
    },
    {
      id: "p-2",
      name: "Mochila Urbana 25L",
      category: "Moda",
      shortDescription: "Impermeable con bolsillo para notebook.",
      description:
        "Mochila reforzada con cierres YKK, espalda acolchada y compartimentos independientes para trabajo y viajes.",
      price: 32900,
      stock: 12,
      freeShipping: false,
      images: [
        "https://images.unsplash.com/photo-1547949003-9792a18a2601?auto=format&fit=crop&w=1000&q=80",
        "https://images.unsplash.com/photo-1516826957135-700dedea698c?auto=format&fit=crop&w=1000&q=80",
      ],
    },
    {
      id: "p-3",
      name: "Set Matero Premium",
      category: "Hogar",
      shortDescription: "Mate termico con accesorios completos.",
      description:
        "Incluye mate de acero inoxidable, bombilla filtrante, yerbera y azucarera. Ideal para uso diario o regalo.",
      price: 19990,
      stock: 30,
      freeShipping: false,
      images: [
        "https://images.unsplash.com/photo-1594631661960-87f146f717d2?auto=format&fit=crop&w=1000&q=80",
      ],
    },
  ],
  orders: [],
  customers: [],
};

const currency = (value: number) => `$${value.toLocaleString("es-AR")}`;

const resolveCustomerKey = (customer: CustomerData) => {
  const email = customer.email.trim().toLowerCase();
  if (email) {
    return `email:${email}`;
  }
  const phone = customer.phone.replace(/\D/g, "");
  if (phone) {
    return `phone:${phone}`;
  }
  return `name:${customer.name.trim().toLowerCase()}-${customer.address.trim().toLowerCase()}`;
};

const buildCustomerDatabase = (orders: Order[]): CustomerRecord[] => {
  const byId = new Map<string, CustomerRecord>();

  orders.forEach((order) => {
    const key = resolveCustomerKey(order.customer);
    const existing = byId.get(key);
    const merchandise = Array.from(new Set(order.items.map((item) => item.name)));

    if (!existing) {
      byId.set(key, {
        id: key,
        name: order.customer.name,
        email: order.customer.email,
        phone: order.customer.phone,
        address: order.customer.address,
        city: order.customer.city,
        marketingOptIn: order.customer.marketingOptIn,
        ordersCount: 1,
        totalSpent: order.total,
        lastOrderAt: order.createdAt,
        merchandise,
      });
      return;
    }

    byId.set(key, {
      ...existing,
      name: order.customer.name || existing.name,
      email: order.customer.email || existing.email,
      phone: order.customer.phone || existing.phone,
      address: order.customer.address || existing.address,
      city: order.customer.city || existing.city,
      marketingOptIn: existing.marketingOptIn || order.customer.marketingOptIn,
      ordersCount: existing.ordersCount + 1,
      totalSpent: existing.totalSpent + order.total,
      lastOrderAt: order.createdAt,
      merchandise: Array.from(new Set([...existing.merchandise, ...merchandise])),
    });
  });

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime(),
  );
};

const normalizeProducts = (products: unknown): Product[] => {
  if (!Array.isArray(products) || products.length === 0) {
    return defaultData.products;
  }

  return products.map((item, index) => {
    const candidate = item as Partial<Product> & { image?: string };
    const images = Array.isArray(candidate.images)
      ? candidate.images.filter(Boolean).slice(0, 4)
      : candidate.image
        ? [candidate.image]
        : [];

    return {
      id: candidate.id || `p-${index + 1}`,
      name: candidate.name || "Producto",
      category: candidate.category || "General",
      shortDescription: candidate.shortDescription || candidate.description || "",
      description: candidate.description || candidate.shortDescription || "",
      price: Number(candidate.price) || 0,
      stock: Number(candidate.stock) || 0,
      images: images.length ? images : [productFallbackImage],
      freeShipping: candidate.freeShipping === true,
    };
  });
};

const normalizeShippingMethods = (methods: unknown): ShippingMethod[] => {
  if (!Array.isArray(methods) || methods.length === 0) {
    return defaultData.shippingMethods;
  }

  if (typeof methods[0] === "string") {
    return (methods as string[]).map((name, index) => ({
      id: `envio-${index + 1}`,
      name,
      eta: "24 a 72 hs",
      baseCost: 5000,
      freeFrom: 70000,
    }));
  }

  return (methods as Partial<ShippingMethod>[]).map((method, index) => ({
    id: method.id || `envio-${index + 1}`,
    name: method.name || `Envio ${index + 1}`,
    eta: method.eta || "24 a 72 hs",
    baseCost: Number(method.baseCost) || 0,
    freeFrom: Number(method.freeFrom) || 0,
  }));
};

const normalizeStoreData = (raw: Partial<StoreData>): StoreData => {
  const orders = Array.isArray(raw.orders)
    ? raw.orders.map((order, index) => ({
        ...order,
        id: order.id || `PED-${String(index + 1).padStart(4, "0")}`,
        createdAt: order.createdAt || new Date().toISOString(),
        customer: {
          ...defaultCustomerData,
          ...order.customer,
        },
        subtotal: Number(order.subtotal) || Number(order.total) || 0,
        shippingCost: Number(order.shippingCost) || 0,
        total: Number(order.total) || 0,
        shippingMethodId: order.shippingMethodId || "",
        shippingMethodName: order.shippingMethodName || "",
        status: order.status || "nuevo",
        documentType: order.documentType || "factura",
      }))
    : [];

  return {
    theme: { ...defaultData.theme, ...(raw.theme || {}) },
    contact: { ...defaultData.contact, ...(raw.contact || {}) },
    paymentMethods:
      Array.isArray(raw.paymentMethods) && raw.paymentMethods.length
        ? raw.paymentMethods
        : defaultData.paymentMethods,
    shippingMethods: normalizeShippingMethods(raw.shippingMethods),
    products: normalizeProducts(raw.products),
    orders,
    customers: buildCustomerDatabase(orders),
  };
};

const getShippingCost = (method: ShippingMethod | undefined, subtotal: number) => {
  if (!method) {
    return 0;
  }
  if (method.freeFrom > 0 && subtotal >= method.freeFrom) {
    return 0;
  }
  return method.baseCost;
};

const parseJson = (raw: string | null): Partial<StoreData> | null => {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as Partial<StoreData>;
  } catch {
    return null;
  }
};

export default function App() {
  const firebase = useMemo(() => getFirebaseServices(), []);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const [syncReady, setSyncReady] = useState(false);

  const localSnapshot = parseJson(localStorage.getItem(STORAGE_KEY));
  const [data, setData] = useState<StoreData>(normalizeStoreData(localSnapshot || defaultData));
  const [mode, setMode] = useState<"store" | "admin">("store");
  const [adminTab, setAdminTab] = useState<"config" | "products" | "orders" | "customers">("config");
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerData, setCustomerData] = useState<CustomerData>(defaultCustomerData);
  const [selectedPayment, setSelectedPayment] = useState(defaultData.paymentMethods[0]);
  const [selectedShippingId, setSelectedShippingId] = useState(defaultData.shippingMethods[0].id);
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [newPayment, setNewPayment] = useState("");
  const [newShipping, setNewShipping] = useState<Omit<ShippingMethod, "id">>({
    name: "",
    eta: "24 a 72 hs",
    baseCost: 0,
    freeFrom: 0,
  });
  const [newProduct, setNewProduct] = useState<{
    name: string;
    category: string;
    shortDescription: string;
    description: string;
    price: number;
    stock: number;
    images: string[];
    freeShipping: boolean;
  }>({
    name: "",
    category: "",
    shortDescription: "",
    description: "",
    price: 0,
    stock: 0,
    images: ["", "", "", ""],
    freeShipping: false,
  });

  useEffect(() => {
    let mounted = true;

    const loadRemote = async () => {
      if (!firebase.db) {
        if (mounted) {
          setSyncStatus("firebase-not-configured");
          setSyncReady(true);
        }
        return;
      }

      try {
        const storeRef = doc(firebase.db, "stores", "principal");
        const snap = await getDoc(storeRef);
        if (mounted && snap.exists()) {
          setData(normalizeStoreData(snap.data() as Partial<StoreData>));
        }
        if (mounted) {
          setSyncStatus("firebase-connected");
        }
      } catch {
        if (mounted) {
          setSyncStatus("firebase-error");
        }
      } finally {
        if (mounted) {
          setSyncReady(true);
        }
      }
    };

    loadRemote();

    return () => {
      mounted = false;
    };
  }, [firebase.db]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    if (!syncReady || !firebase.db) {
      return;
    }

    const storeRef = doc(firebase.db, "stores", "principal");
    setDoc(
      storeRef,
      {
        ...data,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    ).catch(() => setSyncStatus("firebase-error"));
  }, [data, firebase.db, syncReady]);

  useEffect(() => {
    if (!data.paymentMethods.includes(selectedPayment)) {
      setSelectedPayment(data.paymentMethods[0] || "");
    }
  }, [data.paymentMethods, selectedPayment]);

  useEffect(() => {
    if (!data.shippingMethods.find((method) => method.id === selectedShippingId)) {
      setSelectedShippingId(data.shippingMethods[0]?.id || "");
    }
  }, [data.shippingMethods, selectedShippingId]);

  const categories = useMemo(
    () => ["Todos", ...Array.from(new Set(data.products.map((product) => product.category)))],
    [data.products],
  );

  const filteredProducts = useMemo(() => {
    if (selectedCategory === "Todos") {
      return data.products;
    }
    return data.products.filter((product) => product.category === selectedCategory);
  }, [data.products, selectedCategory]);

  const cartSummary = useMemo(() => {
    const items = cart
      .map((item) => {
        const product = data.products.find((candidate) => candidate.id === item.productId);
        if (!product) {
          return null;
        }
        return {
          ...item,
          name: product.name,
          unitPrice: product.price,
          subtotal: product.price * item.quantity,
          freeShipping: product.freeShipping,
        };
      })
      .filter(Boolean) as Array<CartItem & { name: string; unitPrice: number; subtotal: number; freeShipping: boolean }>;

    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const selectedShipping = data.shippingMethods.find((method) => method.id === selectedShippingId);
    const hasPaidShippingItems = items.some((item) => !item.freeShipping);
    const shippingCost = hasPaidShippingItems ? getShippingCost(selectedShipping, subtotal) : 0;

    return {
      items,
      subtotal,
      shippingCost,
      hasPaidShippingItems,
      total: subtotal + shippingCost,
    };
  }, [cart, data.products, data.shippingMethods, selectedShippingId]);

  const selectedProduct = data.products.find((product) => product.id === selectedProductId) || null;

  const addToCart = (productId: string) => {
    const product = data.products.find((item) => item.id === productId);
    if (!product || product.stock <= 0) {
      return;
    }

    setCart((current) => {
      const existing = current.find((item) => item.productId === productId);
      if (!existing) {
        return [...current, { productId, quantity: 1 }];
      }
      const nextQty = Math.min(existing.quantity + 1, product.stock);
      return current.map((item) =>
        item.productId === productId ? { ...item, quantity: nextQty } : item,
      );
    });
  };

  const updateCartQty = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((current) => current.filter((item) => item.productId !== productId));
      return;
    }

    const product = data.products.find((item) => item.id === productId);
    if (!product) {
      return;
    }

    setCart((current) =>
      current.map((item) =>
        item.productId === productId ? { ...item, quantity: Math.min(quantity, product.stock) } : item,
      ),
    );
  };

  const placeOrder = (event: FormEvent) => {
    event.preventDefault();
    setCheckoutMessage("");

    if (!cartSummary.items.length) {
      setCheckoutMessage("Agrega productos al carrito antes de comprar.");
      return;
    }

    if (!customerData.name || !customerData.email || !customerData.phone || !customerData.address) {
      setCheckoutMessage("Completa nombre, email, telefono y direccion.");
      return;
    }

    const selectedShipping = data.shippingMethods.find((method) => method.id === selectedShippingId);
    if (!selectedShipping) {
      setCheckoutMessage("Selecciona una forma de envio.");
      return;
    }

    const order: Order = {
      id: `PED-${String(data.orders.length + 1).padStart(5, "0")}`,
      createdAt: new Date().toISOString(),
      items: cartSummary.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      subtotal: cartSummary.subtotal,
      shippingMethodId: selectedShipping.id,
      shippingMethodName: selectedShipping.name,
      shippingCost: cartSummary.shippingCost,
      total: cartSummary.total,
      paymentMethod: selectedPayment,
      customer: customerData,
      status: "nuevo",
      documentType: "factura",
    };

    setData((current) => {
      const nextProducts = current.products.map((product) => {
        const inCart = cartSummary.items.find((item) => item.productId === product.id);
        if (!inCart) {
          return product;
        }
        return {
          ...product,
          stock: Math.max(product.stock - inCart.quantity, 0),
        };
      });
      const nextOrders = [order, ...current.orders];
      return {
        ...current,
        products: nextProducts,
        orders: nextOrders,
        customers: buildCustomerDatabase(nextOrders),
      };
    });

    setCart([]);
    setCustomerData(defaultCustomerData);
    setCheckoutMessage(`Pedido ${order.id} registrado.`);
    setMode("admin");
    setAdminTab("orders");
  };

  const addProduct = (event: FormEvent) => {
    event.preventDefault();
    const images = newProduct.images.map((image) => image.trim()).filter(Boolean).slice(0, 4);

    if (!newProduct.name || !newProduct.category || !newProduct.description || !images.length) {
      return;
    }

    const product: Product = {
      id: `p-${Math.random().toString(36).slice(2, 9)}`,
      name: newProduct.name,
      category: newProduct.category,
      shortDescription: newProduct.shortDescription || newProduct.description.slice(0, 85),
      description: newProduct.description,
      price: newProduct.price,
      stock: newProduct.stock,
      images,
      freeShipping: newProduct.freeShipping,
    };

    setData((current) => ({
      ...current,
      products: [product, ...current.products],
    }));

    setNewProduct({
      name: "",
      category: "",
      shortDescription: "",
      description: "",
      price: 0,
      stock: 0,
      images: ["", "", "", ""],
      freeShipping: false,
    });
  };

  const removeProduct = (productId: string) => {
    setData((current) => ({
      ...current,
      products: current.products.filter((product) => product.id !== productId),
    }));
    setCart((current) => current.filter((item) => item.productId !== productId));
    if (selectedProductId === productId) {
      setSelectedProductId(null);
    }
  };

  const setProductFreeShipping = (productId: string, value: boolean) => {
    setData((current) => ({
      ...current,
      products: current.products.map((product) =>
        product.id === productId ? { ...product, freeShipping: value } : product,
      ),
    }));
  };

  const setAllProductsFreeShipping = (value: boolean) => {
    setData((current) => ({
      ...current,
      products: current.products.map((product) => ({ ...product, freeShipping: value })),
    }));
  };

  const updateOrder = (id: string, changes: Partial<Order>) => {
    setData((current) => ({
      ...current,
      orders: current.orders.map((order) => (order.id === id ? { ...order, ...changes } : order)),
    }));
  };

  const addPaymentMethod = () => {
    if (!newPayment.trim()) {
      return;
    }
    setData((current) => ({
      ...current,
      paymentMethods: [...current.paymentMethods, newPayment.trim()],
    }));
    setNewPayment("");
  };

  const deletePaymentMethod = (method: string) => {
    setData((current) => ({
      ...current,
      paymentMethods: current.paymentMethods.filter((item) => item !== method),
    }));
  };

  const addShippingMethod = () => {
    if (!newShipping.name.trim()) {
      return;
    }
    setData((current) => ({
      ...current,
      shippingMethods: [
        ...current.shippingMethods,
        {
          id: `envio-${Math.random().toString(36).slice(2, 9)}`,
          name: newShipping.name.trim(),
          eta: newShipping.eta || "24 a 72 hs",
          baseCost: Math.max(0, newShipping.baseCost),
          freeFrom: Math.max(0, newShipping.freeFrom),
        },
      ],
    }));
    setNewShipping({
      name: "",
      eta: "24 a 72 hs",
      baseCost: 0,
      freeFrom: 0,
    });
  };

  const deleteShippingMethod = (id: string) => {
    setData((current) => ({
      ...current,
      shippingMethods: current.shippingMethods.filter((method) => method.id !== id),
    }));
  };

  const exportCustomersCsv = () => {
    const headers = [
      "nombre",
      "email",
      "telefono",
      "direccion",
      "ciudad",
      "acepta_marketing",
      "compras",
      "total_gastado",
      "ultima_compra",
      "mercaderia",
    ];
    const rows = data.customers.map((customer) => [
      customer.name,
      customer.email,
      customer.phone,
      customer.address,
      customer.city,
      customer.marketingOptIn ? "si" : "no",
      String(customer.ordersCount),
      String(customer.totalSpent),
      customer.lastOrderAt,
      customer.merchandise.join(" | "),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "clientes.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const heroImage = data.theme.heroImage || data.products[0]?.images[0] || productFallbackImage;

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: data.theme.surfaceColor, fontFamily: data.theme.fontFamily }}
    >
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button className="flex items-center gap-3" onClick={() => setMode("store")}>
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: data.theme.primaryColor }}
            >
              {data.theme.logoInitials || "MM"}
            </div>
            <p className="text-lg font-bold text-slate-900">{data.theme.storeName}</p>
          </button>

          <div className="flex items-center gap-2">
            <button
              className={`min-h-11 rounded-full px-4 text-sm font-semibold ${mode === "store" ? "text-white" : "bg-slate-100 text-slate-700"}`}
              style={mode === "store" ? { backgroundColor: data.theme.primaryColor } : undefined}
              onClick={() => setMode("store")}
            >
              Tienda
            </button>
            <button
              className={`min-h-11 rounded-full px-4 text-sm font-semibold ${mode === "admin" ? "text-white" : "bg-slate-100 text-slate-700"}`}
              style={mode === "admin" ? { backgroundColor: data.theme.primaryColor } : undefined}
              onClick={() => setMode("admin")}
            >
              Admin
            </button>
            <p className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
              Carrito: {cart.reduce((sum, item) => sum + item.quantity, 0)}
            </p>
          </div>
        </div>
      </header>

      {mode === "store" ? (
        <main>
          <section className="relative min-h-[68vh] overflow-hidden">
            <img src={heroImage} alt={data.theme.storeName} className="absolute inset-0 h-full w-full object-cover" />
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(120deg, ${data.theme.primaryColor}dd, #0f172ab8)` }}
            />
            <div className="relative mx-auto flex min-h-[68vh] w-full max-w-7xl items-end px-4 pb-14 pt-20 sm:px-6">
              <div className="max-w-2xl text-white">
                <p className="text-xl font-bold sm:text-2xl">{data.theme.storeName}</p>
                <h1 className="mt-3 text-3xl font-extrabold sm:text-5xl">{data.theme.heroLine}</h1>
                <p className="mt-4 text-sm text-white/90 sm:text-base">{data.theme.supportLine}</p>
                <a href="#catalogo" className="mt-8 inline-flex min-h-11 items-center rounded-full bg-white px-6 text-sm font-bold text-slate-900">
                  Ver catalogo
                </a>
              </div>
            </div>
          </section>

          <section id="catalogo" className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
            <div className="mb-5 flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category}
                  className={`min-h-11 rounded-full px-4 text-sm font-semibold ${selectedCategory === category ? "text-white" : "bg-white text-slate-700"}`}
                  style={selectedCategory === category ? { backgroundColor: data.theme.primaryColor } : undefined}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProducts.map((product) => (
                <article key={product.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <img src={product.images[0]} alt={product.name} className="h-44 w-full object-cover" />
                  <div className="space-y-3 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">{product.category}</p>
                    <h3 className="text-lg font-bold text-slate-900">{product.name}</h3>
                    <p className="text-sm text-slate-600">{product.shortDescription}</p>
                    {product.freeShipping ? <p className="text-xs font-semibold text-emerald-700">Envio gratis en este producto</p> : null}
                    <div className="flex items-center justify-between">
                      <p className="text-lg font-extrabold text-slate-900">{currency(product.price)}</p>
                      <div className="flex gap-2">
                        <button
                          className="min-h-11 rounded-full border border-slate-300 px-4 text-sm font-semibold text-slate-700"
                          onClick={() => {
                            setSelectedProductId(product.id);
                            setActiveImage(0);
                          }}
                        >
                          Ver mas
                        </button>
                        <button
                          className="min-h-11 rounded-full px-4 text-sm font-semibold text-white"
                          style={{ backgroundColor: data.theme.primaryColor }}
                          onClick={() => addToCart(product.id)}
                        >
                          Agregar
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="border-t border-slate-200 bg-white/80 py-10">
            <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-2xl font-bold text-slate-900">Carrito</h2>
                {cartSummary.items.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-600">Todavia no hay productos en el carrito.</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {cartSummary.items.map((item) => (
                      <div key={item.productId} className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div>
                          <p className="font-semibold text-slate-900">{item.name}</p>
                          <p className="text-xs text-slate-500">{currency(item.unitPrice)} c/u</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="h-10 w-10 rounded-full bg-slate-100 text-lg"
                            onClick={() => updateCartQty(item.productId, item.quantity - 1)}
                          >
                            -
                          </button>
                          <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                          <button
                            className="h-10 w-10 rounded-full bg-slate-100 text-lg"
                            onClick={() => updateCartQty(item.productId, item.quantity + 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                    <p className="text-sm text-slate-700">Subtotal: {currency(cartSummary.subtotal)}</p>
                    <p className="text-sm text-slate-700">Envio: {currency(cartSummary.shippingCost)}</p>
                    {!cartSummary.hasPaidShippingItems && cartSummary.items.length ? (
                      <p className="text-xs font-semibold text-emerald-700">Todos los productos del carrito tienen envio gratis.</p>
                    ) : null}
                    <p className="text-xl font-extrabold text-slate-900">Total: {currency(cartSummary.total)}</p>
                  </div>
                )}
              </div>

              <form onSubmit={placeOrder} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-2xl font-bold text-slate-900">Finalizar pedido</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className="rounded-xl border border-slate-300 px-3 py-3" placeholder="Nombre" value={customerData.name} onChange={(event) => setCustomerData({ ...customerData, name: event.target.value })} />
                  <input className="rounded-xl border border-slate-300 px-3 py-3" placeholder="Email" value={customerData.email} onChange={(event) => setCustomerData({ ...customerData, email: event.target.value })} />
                  <input className="rounded-xl border border-slate-300 px-3 py-3" placeholder="Telefono" value={customerData.phone} onChange={(event) => setCustomerData({ ...customerData, phone: event.target.value })} />
                  <input className="rounded-xl border border-slate-300 px-3 py-3" placeholder="Ciudad" value={customerData.city} onChange={(event) => setCustomerData({ ...customerData, city: event.target.value })} />
                </div>
                <input className="w-full rounded-xl border border-slate-300 px-3 py-3" placeholder="Direccion" value={customerData.address} onChange={(event) => setCustomerData({ ...customerData, address: event.target.value })} />
                <textarea className="w-full rounded-xl border border-slate-300 px-3 py-3" placeholder="Notas" value={customerData.notes} onChange={(event) => setCustomerData({ ...customerData, notes: event.target.value })} />

                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={customerData.marketingOptIn} onChange={(event) => setCustomerData({ ...customerData, marketingOptIn: event.target.checked })} />
                  Acepto recibir publicidad y promociones futuras.
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <select className="rounded-xl border border-slate-300 px-3 py-3" value={selectedPayment} onChange={(event) => setSelectedPayment(event.target.value)}>
                    {data.paymentMethods.map((method) => (
                      <option key={method}>{method}</option>
                    ))}
                  </select>
                  <select className="rounded-xl border border-slate-300 px-3 py-3" value={selectedShippingId} onChange={(event) => setSelectedShippingId(event.target.value)}>
                    {data.shippingMethods.map((method) => {
                      const cost = cartSummary.hasPaidShippingItems ? getShippingCost(method, cartSummary.subtotal) : 0;
                      return (
                        <option key={method.id} value={method.id}>
                          {method.name} - {cost === 0 ? "Gratis" : currency(cost)} ({method.eta})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <button type="submit" className="w-full rounded-xl px-4 py-3 font-bold text-white" style={{ backgroundColor: data.theme.primaryColor }}>
                  Confirmar compra
                </button>
                {checkoutMessage ? <p className="text-sm text-slate-600">{checkoutMessage}</p> : null}
              </form>
            </div>
          </section>
        </main>
      ) : (
        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
          <div className="mb-6 flex flex-wrap gap-2">
            {[
              ["config", "Configuracion"],
              ["products", "Productos"],
              ["orders", `Pedidos (${data.orders.length})`],
              ["customers", `Clientes (${data.customers.length})`],
            ].map(([key, label]) => (
              <button
                key={key}
                className={`min-h-11 rounded-full px-4 text-sm font-semibold ${adminTab === key ? "text-white" : "bg-white text-slate-700"}`}
                style={adminTab === key ? { backgroundColor: data.theme.primaryColor } : undefined}
                onClick={() => setAdminTab(key as typeof adminTab)}
              >
                {label}
              </button>
            ))}
          </div>

          {adminTab === "config" ? (
            <section className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-xl font-bold text-slate-900">Marca y diseno</h2>
                <input className="w-full rounded-xl border border-slate-300 px-3 py-3" placeholder="Nombre de tienda" value={data.theme.storeName} onChange={(event) => setData({ ...data, theme: { ...data.theme, storeName: event.target.value } })} />
                <input className="w-full rounded-xl border border-slate-300 px-3 py-3" placeholder="Titular principal" value={data.theme.heroLine} onChange={(event) => setData({ ...data, theme: { ...data.theme, heroLine: event.target.value } })} />
                <input className="w-full rounded-xl border border-slate-300 px-3 py-3" placeholder="Texto secundario" value={data.theme.supportLine} onChange={(event) => setData({ ...data, theme: { ...data.theme, supportLine: event.target.value } })} />
                <input className="w-full rounded-xl border border-slate-300 px-3 py-3" placeholder="Iniciales del logo" value={data.theme.logoInitials} onChange={(event) => setData({ ...data, theme: { ...data.theme, logoInitials: event.target.value.toUpperCase().slice(0, 3) } })} />
                <input className="w-full rounded-xl border border-slate-300 px-3 py-3" placeholder="URL imagen hero" value={data.theme.heroImage} onChange={(event) => setData({ ...data, theme: { ...data.theme, heroImage: event.target.value } })} />
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-slate-600">
                    Color principal
                    <input type="color" className="mt-1 h-10 w-full rounded border border-slate-300" value={data.theme.primaryColor} onChange={(event) => setData({ ...data, theme: { ...data.theme, primaryColor: event.target.value } })} />
                  </label>
                  <label className="text-xs text-slate-600">
                    Fondo
                    <input type="color" className="mt-1 h-10 w-full rounded border border-slate-300" value={data.theme.surfaceColor} onChange={(event) => setData({ ...data, theme: { ...data.theme, surfaceColor: event.target.value } })} />
                  </label>
                </div>
              </div>

              <div className="space-y-5">
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
                  <h2 className="text-xl font-bold text-slate-900">Contacto</h2>
                  <input className="w-full rounded-xl border border-slate-300 px-3 py-3" placeholder="Email" value={data.contact.email} onChange={(event) => setData({ ...data, contact: { ...data.contact, email: event.target.value } })} />
                  <input className="w-full rounded-xl border border-slate-300 px-3 py-3" placeholder="Telefono" value={data.contact.phone} onChange={(event) => setData({ ...data, contact: { ...data.contact, phone: event.target.value } })} />
                  <input className="w-full rounded-xl border border-slate-300 px-3 py-3" placeholder="WhatsApp" value={data.contact.whatsapp} onChange={(event) => setData({ ...data, contact: { ...data.contact, whatsapp: event.target.value } })} />
                  <input className="w-full rounded-xl border border-slate-300 px-3 py-3" placeholder="Direccion" value={data.contact.address} onChange={(event) => setData({ ...data, contact: { ...data.contact, address: event.target.value } })} />
                </div>

                <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
                  <h2 className="text-xl font-bold text-slate-900">Firebase</h2>
                  <p className="text-sm text-slate-600">
                    Estado: {syncStatus}. Si completas variables VITE_FIREBASE_*, la tienda sincroniza productos, pedidos y clientes en Firestore.
                  </p>
                  <p className="text-xs text-slate-500">
                    Collection usada: stores / documento: principal. Las imagenes pueden ser URLs de Firebase Storage.
                  </p>
                </div>

                <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
                  <h2 className="text-xl font-bold text-slate-900">Pagos y envios</h2>
                  <div>
                    <p className="mb-2 text-sm font-semibold text-slate-700">Formas de pago</p>
                    <div className="flex gap-2">
                      <input className="w-full rounded-xl border border-slate-300 px-3 py-3" value={newPayment} placeholder="Nueva forma de pago" onChange={(event) => setNewPayment(event.target.value)} />
                      <button type="button" className="rounded-xl px-4 text-sm font-semibold text-white" style={{ backgroundColor: data.theme.primaryColor }} onClick={addPaymentMethod}>
                        Agregar
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {data.paymentMethods.map((method) => (
                        <button key={method} type="button" className="rounded-full border border-slate-300 px-3 py-1 text-xs" onClick={() => deletePaymentMethod(method)}>
                          {method} x
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold text-slate-700">Agregar envio por importe</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input className="rounded-xl border border-slate-300 px-3 py-3" placeholder="Nombre" value={newShipping.name} onChange={(event) => setNewShipping({ ...newShipping, name: event.target.value })} />
                      <input className="rounded-xl border border-slate-300 px-3 py-3" placeholder="Entrega" value={newShipping.eta} onChange={(event) => setNewShipping({ ...newShipping, eta: event.target.value })} />
                      <input type="number" min={0} className="rounded-xl border border-slate-300 px-3 py-3" placeholder="Costo base" value={newShipping.baseCost || ""} onChange={(event) => setNewShipping({ ...newShipping, baseCost: Number(event.target.value) })} />
                      <input type="number" min={0} className="rounded-xl border border-slate-300 px-3 py-3" placeholder="Gratis desde" value={newShipping.freeFrom || ""} onChange={(event) => setNewShipping({ ...newShipping, freeFrom: Number(event.target.value) })} />
                    </div>
                    <button type="button" className="mt-2 rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: data.theme.primaryColor }} onClick={addShippingMethod}>
                      Guardar envio
                    </button>
                    <div className="mt-3 space-y-2">
                      {data.shippingMethods.map((method) => (
                        <div key={method.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                          <p>
                            {method.name} | {currency(method.baseCost)} | gratis desde {currency(method.freeFrom)}
                          </p>
                          <button type="button" className="text-red-600" onClick={() => deleteShippingMethod(method.id)}>
                            Eliminar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {adminTab === "products" ? (
            <section className="grid gap-6 lg:grid-cols-2">
              <form onSubmit={addProduct} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-xl font-bold text-slate-900">Nuevo producto (maximo 4 imagenes)</h2>
                <input className="w-full rounded-xl border border-slate-300 px-3 py-3" placeholder="Nombre" value={newProduct.name} onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })} />
                <input className="w-full rounded-xl border border-slate-300 px-3 py-3" placeholder="Rubro / categoria" value={newProduct.category} onChange={(event) => setNewProduct({ ...newProduct, category: event.target.value })} />
                <input className="w-full rounded-xl border border-slate-300 px-3 py-3" placeholder="Descripcion corta" value={newProduct.shortDescription} onChange={(event) => setNewProduct({ ...newProduct, shortDescription: event.target.value })} />
                <textarea className="w-full rounded-xl border border-slate-300 px-3 py-3" placeholder="Descripcion completa" value={newProduct.description} onChange={(event) => setNewProduct({ ...newProduct, description: event.target.value })} />
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700">
                  <input type="checkbox" checked={newProduct.freeShipping} onChange={(event) => setNewProduct({ ...newProduct, freeShipping: event.target.checked })} />
                  Este producto tiene envio gratis
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" min={0} className="rounded-xl border border-slate-300 px-3 py-3" placeholder="Precio" value={newProduct.price || ""} onChange={(event) => setNewProduct({ ...newProduct, price: Number(event.target.value) })} />
                  <input type="number" min={0} className="rounded-xl border border-slate-300 px-3 py-3" placeholder="Stock" value={newProduct.stock || ""} onChange={(event) => setNewProduct({ ...newProduct, stock: Number(event.target.value) })} />
                </div>
                {newProduct.images.map((image, index) => (
                  <input
                    key={index}
                    className="w-full rounded-xl border border-slate-300 px-3 py-3"
                    placeholder={`URL imagen ${index + 1}`}
                    value={image}
                    onChange={(event) => {
                      const next = [...newProduct.images];
                      next[index] = event.target.value;
                      setNewProduct({ ...newProduct, images: next });
                    }}
                  />
                ))}
                <button type="submit" className="w-full rounded-xl px-4 py-3 font-semibold text-white" style={{ backgroundColor: data.theme.primaryColor }}>
                  Guardar producto
                </button>
              </form>

              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-xl font-bold text-slate-900">Catalogo actual</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700"
                    onClick={() => setAllProductsFreeShipping(true)}
                  >
                    Envio gratis masivo: SI
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                    onClick={() => setAllProductsFreeShipping(false)}
                  >
                    Envio gratis masivo: NO
                  </button>
                </div>
                <div className="mt-3 max-h-[560px] space-y-2 overflow-auto">
                  {data.products.map((product) => (
                    <div key={product.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                      <div>
                        <p className="font-semibold text-slate-900">{product.name}</p>
                        <p className="text-xs text-slate-500">
                          {product.category} | {currency(product.price)} | stock {product.stock} | {product.images.length} imagenes | envio gratis {product.freeShipping ? "si" : "no"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={`rounded-lg border px-3 py-1 text-xs font-semibold ${product.freeShipping ? "border-emerald-300 text-emerald-700" : "border-slate-300 text-slate-700"}`}
                          onClick={() => setProductFreeShipping(product.id, !product.freeShipping)}
                        >
                          Envio gratis: {product.freeShipping ? "SI" : "NO"}
                        </button>
                        <button className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600" onClick={() => removeProduct(product.id)}>
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {adminTab === "orders" ? (
            <section className="space-y-3">
              {data.orders.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
                  Aun no hay compras registradas.
                </div>
              ) : (
                data.orders.map((order) => {
                  const message = `Hola ${order.customer.name}, te enviamos tu ${order.documentType} del pedido ${order.id}. Total ${currency(order.total)}.`;
                  const whatsappLink = `https://wa.me/${order.customer.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
                  const emailLink = `mailto:${order.customer.email}?subject=${encodeURIComponent(`${order.documentType.toUpperCase()} ${order.id}`)}&body=${encodeURIComponent(message)}`;
                  return (
                    <article key={order.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                        <div>
                          <p className="text-lg font-bold text-slate-900">
                            {order.id} | {currency(order.total)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {new Date(order.createdAt).toLocaleString("es-AR")} | {order.paymentMethod} | {order.shippingMethodName}
                          </p>
                        </div>
                        <select className="rounded-xl border border-slate-300 px-3 py-2" value={order.status} onChange={(event) => updateOrder(order.id, { status: event.target.value as Order["status"] })}>
                          <option value="nuevo">Nuevo</option>
                          <option value="contactado">Contactado</option>
                          <option value="facturado">Facturado</option>
                        </select>
                      </div>

                      <div className="grid gap-4 text-sm text-slate-700 lg:grid-cols-2">
                        <div>
                          <p className="font-semibold text-slate-900">Cliente</p>
                          <p>{order.customer.name}</p>
                          <p>{order.customer.email}</p>
                          <p>{order.customer.phone}</p>
                          <p>{order.customer.address}</p>
                          <p>{order.customer.city}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">Mercaderia</p>
                          <ul>
                            {order.items.map((item) => (
                              <li key={`${order.id}-${item.productId}`}>
                                {item.name} x{item.quantity} ({currency(item.unitPrice)})
                              </li>
                            ))}
                          </ul>
                          <p className="mt-2">Subtotal: {currency(order.subtotal)}</p>
                          <p>Envio: {currency(order.shippingCost)}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <select className="rounded-xl border border-slate-300 px-3 py-2" value={order.documentType} onChange={(event) => updateOrder(order.id, { documentType: event.target.value as Order["documentType"] })}>
                          <option value="factura">Factura</option>
                          <option value="recibo">Recibo</option>
                        </select>
                        <a href={whatsappLink} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-white" style={{ backgroundColor: data.theme.primaryColor }}>
                          Enviar por WhatsApp
                        </a>
                        <a href={emailLink} className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700">
                          Enviar por email
                        </a>
                      </div>
                    </article>
                  );
                })
              )}
            </section>
          ) : null}

          {adminTab === "customers" ? (
            <section className="space-y-4">
              <div className="flex justify-end">
                <button className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: data.theme.primaryColor }} onClick={exportCustomersCsv}>
                  Exportar clientes CSV
                </button>
              </div>
              {data.customers.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
                  No hay clientes aun.
                </div>
              ) : (
                data.customers.map((customer) => (
                  <article key={customer.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-lg font-bold text-slate-900">{customer.name}</p>
                    <p className="text-xs text-slate-500">Ultima compra: {new Date(customer.lastOrderAt).toLocaleString("es-AR")}</p>
                    <div className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                      <p>Email: {customer.email || "-"}</p>
                      <p>Telefono: {customer.phone || "-"}</p>
                      <p>Compras: {customer.ordersCount}</p>
                      <p>Total: {currency(customer.totalSpent)}</p>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">Mercaderia: {customer.merchandise.join(", ")}</p>
                  </article>
                ))
              )}
            </section>
          ) : null}
        </main>
      )}

      {selectedProduct ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/70 p-0 sm:items-center sm:p-6" onClick={() => setSelectedProductId(null)}>
          <div className="max-h-[90vh] w-full overflow-auto rounded-t-2xl bg-white p-5 sm:mx-auto sm:max-w-3xl sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xl font-bold text-slate-900">{selectedProduct.name}</p>
              <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm" onClick={() => setSelectedProductId(null)}>
                Cerrar
              </button>
            </div>
            <img src={selectedProduct.images[activeImage] || selectedProduct.images[0]} alt={selectedProduct.name} className="h-64 w-full rounded-xl object-cover sm:h-80" />
            <div className="mt-2 flex gap-2 overflow-auto">
              {selectedProduct.images.slice(0, 4).map((image, index) => (
                <button key={image} className={`h-16 w-16 overflow-hidden rounded-lg border ${activeImage === index ? "border-slate-900" : "border-slate-300"}`} onClick={() => setActiveImage(index)}>
                  <img src={image} alt={`${selectedProduct.name} ${index + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
            <p className="mt-4 text-sm text-slate-500">{selectedProduct.category}</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{currency(selectedProduct.price)}</p>
            <p className="mt-3 text-sm text-slate-700">{selectedProduct.description}</p>
            {selectedProduct.freeShipping ? (
              <p className="mt-3 text-sm font-semibold text-emerald-700">Este producto aplica envio gratis.</p>
            ) : null}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {data.shippingMethods.map((method) => (
                <p key={method.id}>
                  {method.name}: {currency(method.baseCost)} | gratis desde {currency(method.freeFrom)} | {method.eta}
                </p>
              ))}
            </div>
            <button className="mt-4 w-full rounded-xl px-4 py-3 font-semibold text-white" style={{ backgroundColor: data.theme.primaryColor }} onClick={() => addToCart(selectedProduct.id)}>
              Agregar al carrito
            </button>
          </div>
        </div>
      ) : null}

      <footer className="border-t border-slate-200 bg-white/90">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-sm text-slate-600 sm:px-6">
          <p>
            Contacto: {data.contact.email} | {data.contact.phone}
          </p>
          <p>{data.contact.address}</p>
        </div>
      </footer>
    </div>
  );
}