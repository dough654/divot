/**
 * Convenience hook for checking Pro subscription status.
 *
 * Excluded from barrel export (transitive native dep on react-native-purchases).
 * Import directly: import { useProAccess } from '@/src/hooks/use-pro-access';
 */
import { useSubscription } from '@/src/context';

export const useProAccess = (): { isPro: boolean; isLoading: boolean } => {
  const { isPro, isLoading } = useSubscription();
  return { isPro, isLoading };
};
