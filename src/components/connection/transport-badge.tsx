import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useThemedStyles, makeThemedStyles } from '../../hooks';
import { getTransportDisplay } from '../../utils';
import type { Theme } from '../../context';
import type { NetworkTransport } from '../../utils';

export type TransportBadgeProps = {
  transport: NetworkTransport;
};

/** Displays the active network transport as a compact pill badge. */
export const TransportBadge = ({ transport }: TransportBadgeProps) => {
  const styles = useThemedStyles(createStyles);
  const display = getTransportDisplay(transport);

  return (
    <View style={[styles.badge, { backgroundColor: display.backgroundColor }]}>
      <Ionicons
        name={display.icon as keyof typeof Ionicons.glyphMap}
        size={11}
        color={display.color}
      />
      <Text style={[styles.label, { color: display.color }]}>
        {display.label}
      </Text>
    </View>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  badge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
  },
  label: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bodySemiBold,
  },
}));
