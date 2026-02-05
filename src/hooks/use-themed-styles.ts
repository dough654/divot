import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useTheme, Theme } from '../context/theme-context';

type StyleFactory<T extends StyleSheet.NamedStyles<T>> = (theme: Theme) => T;

/**
 * Creates memoized theme-aware styles that only update when the theme changes.
 * Prevents recreating StyleSheets on every render.
 *
 * @param styleFactory - Function that receives the theme and returns styles
 * @returns Memoized StyleSheet
 *
 * @example
 * const MyComponent = () => {
 *   const styles = useThemedStyles((theme) => ({
 *     container: {
 *       backgroundColor: theme.colors.background,
 *       padding: theme.spacing.md,
 *     },
 *     text: {
 *       color: theme.colors.text,
 *       fontSize: theme.fontSize.md,
 *     },
 *   }));
 *
 *   return (
 *     <View style={styles.container}>
 *       <Text style={styles.text}>Hello</Text>
 *     </View>
 *   );
 * };
 */
export const useThemedStyles = <T extends StyleSheet.NamedStyles<T>>(
  styleFactory: StyleFactory<T>
): T => {
  const { theme } = useTheme();

  return useMemo(() => {
    return StyleSheet.create(styleFactory(theme));
  }, [theme, styleFactory]);
};

/**
 * Creates a stable style factory that can be defined outside of components.
 * Use this when you want to define styles at module level for better performance.
 *
 * @param styleFactory - Function that receives the theme and returns styles
 * @returns The same function, typed for use with useThemedStyles
 *
 * @example
 * // Define outside component
 * const createStyles = makeThemedStyles((theme) => ({
 *   container: {
 *     backgroundColor: theme.colors.background,
 *   },
 * }));
 *
 * // Use in component
 * const MyComponent = () => {
 *   const styles = useThemedStyles(createStyles);
 *   return <View style={styles.container} />;
 * };
 */
export const makeThemedStyles = <T extends StyleSheet.NamedStyles<T>>(
  styleFactory: StyleFactory<T>
): StyleFactory<T> => styleFactory;
