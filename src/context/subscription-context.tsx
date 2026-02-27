/**
 * Divot Subscription Context
 *
 * Manages RevenueCat SDK integration and subscription state.
 * Degrades gracefully when API keys are not configured (stays free tier).
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { Platform } from 'react-native';
import Purchases, {
  PurchasesOffering,
  PurchasesPackage,
  CustomerInfo,
} from 'react-native-purchases';
import Constants from 'expo-constants';

// ============================================
// TYPES
// ============================================

type SubscriptionContextValue = {
  /** Whether the user has an active "pro" entitlement. */
  isPro: boolean;
  /** True while RevenueCat is initializing or a purchase is in progress. */
  isLoading: boolean;
  /** The current offering (packages/pricing), null if unavailable. */
  currentOffering: PurchasesOffering | null;
  /** Restore previous purchases. Resolves true if pro was restored. */
  restorePurchases: () => Promise<boolean>;
  /** Purchase a specific package. Resolves true if successful. */
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
};

type SubscriptionProviderProps = {
  /** Clerk user ID for cross-device purchase persistence. Null if not signed in. */
  userId: string | null;
  children: ReactNode;
};

// ============================================
// CONSTANTS
// ============================================

const PRO_ENTITLEMENT_ID = 'pro';

const appleApiKey = (Constants.expoConfig?.extra?.revenuecatAppleApiKey ?? '') as string;
const googleApiKey = (Constants.expoConfig?.extra?.revenuecatGoogleApiKey ?? '') as string;

const getApiKey = (): string => {
  if (Platform.OS === 'ios') return appleApiKey;
  if (Platform.OS === 'android') return googleApiKey;
  return '';
};

const hasApiKey = (): boolean => getApiKey().length > 0;

/** Check customer info for active pro entitlement. */
const checkProEntitlement = (customerInfo: CustomerInfo): boolean =>
  typeof customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] !== 'undefined';

// ============================================
// CONTEXT
// ============================================

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

// ============================================
// PROVIDER
// ============================================

/**
 * Provides subscription state via RevenueCat.
 * When API keys are empty, stays in free-tier mode without crashing.
 */
export const SubscriptionProvider = ({ userId, children }: SubscriptionProviderProps) => {
  const [isPro, setIsPro] = useState(false);
  const [isLoading, setIsLoading] = useState(hasApiKey());
  const [currentOffering, setCurrentOffering] = useState<PurchasesOffering | null>(null);
  const initializedRef = useRef(false);

  // Initialize RevenueCat SDK
  useEffect(() => {
    if (!hasApiKey() || initializedRef.current) return;

    const initialize = async () => {
      try {
        Purchases.configure({ apiKey: getApiKey() });
        initializedRef.current = true;

        // Identify user if signed in
        if (userId) {
          await Purchases.logIn(userId);
        }

        // Fetch current customer info
        const customerInfo = await Purchases.getCustomerInfo();
        setIsPro(checkProEntitlement(customerInfo));

        // Fetch offerings
        const offerings = await Purchases.getOfferings();
        setCurrentOffering(offerings.current ?? null);
      } catch (err) {
        console.warn('[Subscription] RevenueCat init failed:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, [userId]);

  // Identify user changes (e.g. sign in after init)
  useEffect(() => {
    if (!initializedRef.current || !userId) return;

    Purchases.logIn(userId).catch((err) => {
      console.warn('[Subscription] Failed to identify user:', err);
    });
  }, [userId]);

  // Listen for customer info updates
  useEffect(() => {
    if (!hasApiKey()) return;

    const listener = (customerInfo: CustomerInfo) => {
      setIsPro(checkProEntitlement(customerInfo));
    };

    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    if (!initializedRef.current) return false;

    setIsLoading(true);
    try {
      const customerInfo = await Purchases.restorePurchases();
      const restored = checkProEntitlement(customerInfo);
      setIsPro(restored);
      return restored;
    } catch (err) {
      console.warn('[Subscription] Restore failed:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const purchasePackage = useCallback(async (pkg: PurchasesPackage): Promise<boolean> => {
    if (!initializedRef.current) return false;

    setIsLoading(true);
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const purchased = checkProEntitlement(customerInfo);
      setIsPro(purchased);
      return purchased;
    } catch (err: unknown) {
      // User cancelled is not an error
      if (err && typeof err === 'object' && 'userCancelled' in err && (err as { userCancelled: boolean }).userCancelled) {
        return false;
      }
      console.warn('[Subscription] Purchase failed:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      isPro,
      isLoading,
      currentOffering,
      restorePurchases,
      purchasePackage,
    }),
    [isPro, isLoading, currentOffering, restorePurchases, purchasePackage]
  );

  return (
    <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>
  );
};

// ============================================
// HOOK
// ============================================

/**
 * Access subscription state and purchase actions.
 *
 * @returns Subscription context value
 * @throws Error if used outside of SubscriptionProvider
 */
export const useSubscription = (): SubscriptionContextValue => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};
