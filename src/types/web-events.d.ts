/* eslint-disable */
// Global type declarations for React Native Web mouse events
// These events work on web but aren't in the React Native TypeScript types

import "react-native";

declare module "react-native" {
  interface ViewProps {
    onMouseEnter?: (event: any) => void;
    onMouseLeave?: (event: any) => void;
    onMouseOver?: (event: any) => void;
    onMouseOut?: (event: any) => void;
  }

  interface TouchableOpacityProps {
    onMouseEnter?: (event: any) => void;
    onMouseLeave?: (event: any) => void;
    onMouseOver?: (event: any) => void;
    onMouseOut?: (event: any) => void;
  }

  interface TextProps {
    onMouseEnter?: (event: any) => void;
    onMouseLeave?: (event: any) => void;
  }

  interface ScrollViewProps {
    onMouseEnter?: (event: any) => void;
    onMouseLeave?: (event: any) => void;
  }
}
