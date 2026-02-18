import PostHog from 'posthog-react-native';
import Constants from 'expo-constants';

type EventProperties = Record<string, string | number | boolean | null>;

let posthogInstance: PostHog | null = null;

/** Stores the PostHog instance for use by analytics functions. Called once during app init. */
export const setPostHogInstance = (instance: PostHog): void => {
  posthogInstance = instance;
  const appEnv = (Constants.expoConfig?.extra?.appEnv as string) ?? 'development';
  instance.register({ environment: appEnv });
};

/** Captures a named event with optional properties. No-ops if PostHog isn't initialized. */
export const trackEvent = (eventName: string, properties?: EventProperties): void => {
  posthogInstance?.capture(eventName, properties);
};

/** Identifies the current user. For future use when auth is added. */
export const identifyUser = (userId: string): void => {
  posthogInstance?.identify(userId);
};
