// AddMedia mobile: the site on top, the page's social panel below, joined by a draggable bridge bar.
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { type ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Platform, Pressable, Share, StyleSheet, Text, TextInput, View, useColorScheme, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider, useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import WebView, { type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import { scheduleOnRN } from "react-native-worklets";

const extra = (Constants.expoConfig?.extra ?? {}) as { panelUrl?: string; homeUrl?: string };
const PANEL_URL = process.env.EXPO_PUBLIC_PANEL_URL || extra.panelUrl || "https://addmedia.noaplate.com/panel/";
const HOME_URL = extra.homeUrl || "https://www.ynet.co.il";
const BAR = 52;
const SPRING = { damping: 28, stiffness: 320, mass: 1 };

// Runs in every page of the browser pane: reports page identity (never modifies the page).
const WATCH = `(function(){
  if (window.__am) return; window.__am = 1;
  var t = null;
  function meta(s){ var e = document.querySelector(s); return e ? e.getAttribute('content') : null; }
  function abs(h){ try { return h ? new URL(h, location.href).href : null; } catch(e) { return null; } }
  function send(){
    clearTimeout(t);
    t = setTimeout(function(){
      try {
        var c = document.querySelector('link[rel="canonical"]');
        var i = document.querySelector('link[rel~="icon"]') || document.querySelector('link[rel="apple-touch-icon"]');
        window.ReactNativeWebView.postMessage(JSON.stringify({
          t: 'nav', url: location.href,
          canonical: abs(c && c.getAttribute('href')) || abs(meta('meta[property="og:url"]')),
          ogTitle: (meta('meta[property="og:title"]') || '').slice(0, 200),
          docTitle: (document.title || '').slice(0, 200),
          favicon: abs(i && i.getAttribute('href')) || abs('/favicon.ico'),
          optout: (meta('meta[name="addmedia"]') || '').toLowerCase(),
          sensitive: !!document.querySelector('input[type="password"]')
        }));
      } catch(e) {}
    }, 300);
  }
  var ps = history.pushState, rs = history.replaceState;
  history.pushState = function(){ var r = ps.apply(this, arguments); send(); return r; };
  history.replaceState = function(){ var r = rs.apply(this, arguments); send(); return r; };
  addEventListener('popstate', send); addEventListener('hashchange', send);
  if (window.navigation && navigation.addEventListener) navigation.addEventListener('currententrychange', send);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', send); else send();
  addEventListener('load', send);
})(); true;`;

interface PageCtx {
  url: string;
  canonical?: string | null;
  title?: string | null;
  favicon?: string | null;
  optout?: string;
  sensitive?: boolean;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <Shell />
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function hostOf(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

function Shell() {
  const { height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const dark = scheme === "dark";
  const c = dark ? COLORS.dark : COLORS.light;

  const browser = useRef<ComponentRef<typeof WebView>>(null);
  const panel = useRef<ComponentRef<typeof WebView>>(null);
  const panelReady = useRef(false);
  const lastNav = useRef<{ url: string; canonical: string | null; stale: boolean } | null>(null);
  const [uri, setUri] = useState(HOME_URL);
  const [nav, setNav] = useState({ url: HOME_URL, back: false, fwd: false, loading: true, progress: 0 });
  const [page, setPage] = useState<PageCtx | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState(false);
  const [browserKey, setBrowserKey] = useState(0);
  const [panelKey, setPanelKey] = useState(0);

  // snap points = panel height (bridge bar included)
  const snaps = useMemo(() => {
    const full = H - insets.top;
    return [BAR + insets.bottom, Math.round(H * 0.35), Math.round(H * 0.5), Math.round(H * 0.75), full];
  }, [H, insets.top, insets.bottom]);
  const MAX = snaps[snaps.length - 1];
  const panelH = useSharedValue(snaps[2]);
  const [committed, setCommitted] = useState(snaps[2]);
  const beforeExpand = useRef<number | null>(null);
  const start = useSharedValue(0);
  const { height: kb } = useReanimatedKeyboardAnimation();

  const post = useCallback((o: unknown) => panel.current?.postMessage(JSON.stringify(o)), []);
  const commit = useCallback((h: number) => {
    setCommitted(h);
    Haptics.selectionAsync();
  }, []);
  const snapTo = useCallback(
    (h: number) => {
      panelH.value = withSpring(h, SPRING);
      setCommitted(h);
    },
    [panelH],
  );

  useEffect(() => {
    if (panelReady.current) post({ t: "theme", theme: dark ? "dark" : "light" });
  }, [dark, post]);
  useEffect(() => {
    if (panelReady.current) post({ t: "page", page });
  }, [page, post]);

  // drag the bridge bar: move the panel over the browser; resize the browser once, at rest
  const pan = Gesture.Pan()
    .onBegin(() => {
      start.value = panelH.value;
    })
    .onUpdate((e) => {
      const v = start.value - e.translationY;
      const lo = snaps[0];
      const hi = snaps[snaps.length - 1];
      panelH.value = v < lo ? lo - (lo - v) * 0.25 : v > hi ? hi + (v - hi) * 0.25 : v;
    })
    .onEnd((e) => {
      const projected = panelH.value - e.velocityY * 0.18;
      let best = snaps[0];
      for (const s of snaps) if (Math.abs(s - projected) < Math.abs(best - projected)) best = s;
      panelH.value = withSpring(best, { ...SPRING, velocity: -e.velocityY });
      scheduleOnRN(commit, best);
    });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: MAX - panelH.value + Math.min(0, kb.value) * (panelH.value < MAX ? 1 : 0) }],
  }));

  const onBrowserMessage = (e: WebViewMessageEvent) => {
    // messages from arbitrary websites are untrusted hints: validate shape, never act on them beyond page identity
    let m: any;
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (m?.t !== "nav" || typeof m.url !== "string" || !/^https?:\/\//.test(m.url)) return;
    const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);
    // SPA sites often keep the previous article's canonical/og tags after pushState: treat them as stale
    const raw = str(m.canonical, 2000);
    const prev = lastNav.current;
    const stale = !!(prev && raw && (prev.url !== m.url ? raw === prev.canonical : prev.stale && raw === prev.canonical));
    lastNav.current = { url: m.url, canonical: raw, stale };
    setPage({
      url: m.url.slice(0, 2000),
      canonical: stale ? null : raw,
      title: (stale ? str(m.docTitle, 200) : str(m.ogTitle, 200) || str(m.docTitle, 200)) || null,
      favicon: typeof m.favicon === "string" ? m.favicon.slice(0, 500) : null,
      optout: typeof m.optout === "string" ? m.optout.slice(0, 40) : "",
      sensitive: !!m.sensitive,
    });
  };

  const onPanelMessage = (e: WebViewMessageEvent) => {
    let m: any;
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    switch (m?.t) {
      case "ready":
        panelReady.current = true;
        post({ t: "theme", theme: dark ? "dark" : "light" });
        post({ t: "insets", bottom: insets.bottom, kb: 0 });
        post({ t: "page", page });
        break;
      case "haptic":
        if (m.k === "select") Haptics.selectionAsync();
        else if (m.k === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        else if (m.k === "error") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case "open":
        if (typeof m.url === "string" && /^https?:\/\//.test(m.url)) setUri(m.url);
        break;
      case "expand":
        if (m.on) {
          beforeExpand.current = committed;
          snapTo(MAX);
        } else if (beforeExpand.current !== null) {
          snapTo(beforeExpand.current);
          beforeExpand.current = null;
        }
        break;
    }
  };

  const onNav = (n: WebViewNavigation) => {
    setNav((s) => ({ ...s, url: n.url, back: n.canGoBack, fwd: n.canGoForward, loading: n.loading }));
    if (/^https?:/.test(n.url)) setPage((p) => (p && p.url === n.url ? p : { url: n.url, title: n.title || null, canonical: null }));
  };

  const go = () => {
    const v = draft.trim();
    setEditing(false);
    if (!v) return;
    const target = /^https?:\/\//i.test(v) ? v : /^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(v) ? "https://" + v : "https://www.google.com/search?q=" + encodeURIComponent(v);
    setUri(target);
  };

  const browserBottom = committed - 20; // tuck under the panel's rounded corners
  const secure = nav.url.startsWith("https://");

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <StatusBar style={dark ? "light" : "dark"} />
      <View style={[styles.browser, { top: insets.top, bottom: Math.max(browserBottom, BAR) }]}>
        <WebView
          key={browserKey}
          ref={browser}
          source={{ uri }}
          injectedJavaScriptBeforeContentLoaded={WATCH}
          injectedJavaScriptBeforeContentLoadedForMainFrameOnly
          onMessage={onBrowserMessage}
          onNavigationStateChange={onNav}
          onLoadProgress={(e) => setNav((s) => ({ ...s, progress: e.nativeEvent.progress }))}
          onOpenWindow={(e) => setUri(e.nativeEvent.targetUrl)}
          onContentProcessDidTerminate={() => browser.current?.reload()}
          onRenderProcessGone={() => setBrowserKey((k) => k + 1)}
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          pullToRefreshEnabled
          setSupportMultipleWindows
          decelerationRate="normal"
          style={{ backgroundColor: c.bg }}
        />
      </View>

      <Animated.View style={[styles.panel, { height: MAX, backgroundColor: c.surface, shadowColor: "#000" }, panelStyle]}>
        <GestureDetector gesture={pan}>
          <View style={[styles.bar, { borderBottomColor: c.line }]} accessible accessibilityRole="adjustable" accessibilityLabel="גודל הפאנל" onAccessibilityAction={(e) => {
            const i = snaps.indexOf(committed);
            const j = e.nativeEvent.actionName === "increment" ? Math.min(snaps.length - 1, i + 1) : Math.max(0, i - 1);
            snapTo(snaps[j]);
          }} accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}>
            {nav.loading && nav.progress < 1 && <View style={[styles.progress, { width: `${Math.round(nav.progress * 100)}%`, backgroundColor: c.accent }]} />}
            <View style={[styles.grab, { backgroundColor: c.grab }]} />
            <View style={styles.barRow}>
              <Pressable hitSlop={8} disabled={!nav.back} onPress={() => browser.current?.goBack()} accessibilityLabel="חזרה" style={styles.barBtn}>
                <Text style={[styles.barIcon, { color: nav.back ? c.text : c.faint }]}>→</Text>
              </Pressable>
              <Pressable hitSlop={8} disabled={!nav.fwd} onPress={() => browser.current?.goForward()} accessibilityLabel="קדימה" style={styles.barBtn}>
                <Text style={[styles.barIcon, { color: nav.fwd ? c.text : c.faint }]}>←</Text>
              </Pressable>
              <Pressable style={[styles.chip, { backgroundColor: c.sunken }]} onPress={() => (setDraft(nav.url), setEditing(true))} accessibilityLabel="כתובת האתר">
                <Text style={[styles.chipText, { color: c.text }]} numberOfLines={1}>
                  {secure ? "🔒 " : ""}
                  {hostOf(nav.url)}
                </Text>
              </Pressable>
              <Pressable hitSlop={8} onPress={() => setMenu((v) => !v)} accessibilityLabel="תפריט" style={styles.barBtn}>
                <Text style={[styles.barIcon, { color: c.text }]}>⋯</Text>
              </Pressable>
            </View>
          </View>
        </GestureDetector>
        <WebView
          key={panelKey}
          ref={panel}
          source={{ uri: PANEL_URL }}
          onMessage={onPanelMessage}
          onContentProcessDidTerminate={() => panel.current?.reload()}
          onRenderProcessGone={() => setPanelKey((k) => k + 1)}
          originWhitelist={["https://*"]}
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={(r) => {
            if (r.url.startsWith(PANEL_URL) || r.url.startsWith("about:")) return true;
            if (/^https?:\/\//.test(r.url)) setUri(r.url); // links from the panel open in the browser pane
            return false;
          }}
          keyboardDisplayRequiresUserAction={false}
          hideKeyboardAccessoryView
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          style={{ flex: 1, backgroundColor: c.surface }}
        />
      </Animated.View>

      {menu && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(false)}>
          <View style={[styles.menu, { bottom: committed + 8, backgroundColor: c.raised }]}>
            {[
              ["רענון", () => browser.current?.reload()],
              ["שיתוף", () => Share.share({ message: nav.url })],
              ["פתיחה בדפדפן", () => Linking.openURL(nav.url)],
              ["דף הבית", () => setUri(HOME_URL)],
            ].map(([label, fn]) => (
              <Pressable key={label as string} style={styles.menuItem} onPress={() => (setMenu(false), (fn as () => void)())}>
                <Text style={[styles.menuText, { color: c.text }]}>{label as string}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      )}

      {editing && (
        <View style={[styles.urlBox, { top: insets.top + 8, backgroundColor: c.raised }]}>
          <TextInput
            autoFocus
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={go}
            onBlur={() => setEditing(false)}
            selectTextOnFocus
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={Platform.OS === "ios" ? "web-search" : "url"}
            returnKeyType="go"
            placeholder="חיפוש או כתובת"
            placeholderTextColor={c.faint}
            style={[styles.urlInput, { color: c.text, backgroundColor: c.sunken }]}
          />
        </View>
      )}
    </View>
  );
}

const COLORS = {
  light: { bg: "#f6f5f3", surface: "#ffffff", raised: "#ffffff", sunken: "#efeee9", text: "#17151c", faint: "#b7b4be", line: "rgba(23,21,28,0.08)", grab: "rgba(23,21,28,0.18)", accent: "#5b4bff" },
  dark: { bg: "#0f0e13", surface: "#17161d", raised: "#1f1d26", sunken: "#0b0a0e", text: "#f2f0f7", faint: "#5d5968", line: "rgba(255,255,255,0.08)", grab: "rgba(255,255,255,0.22)", accent: "#8b7dff" },
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  browser: { position: "absolute", left: 0, right: 0, overflow: "hidden" },
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 16,
  },
  bar: { height: BAR, justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  progress: { position: "absolute", top: 0, right: 0, height: 2 },
  grab: { position: "absolute", top: 6, alignSelf: "center", width: 36, height: 5, borderRadius: 3 },
  barRow: { flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 10, marginTop: 6, gap: 4 },
  barBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  barIcon: { fontSize: 20, fontWeight: "500" },
  chip: { flex: 1, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  chipText: { fontSize: 14, fontWeight: "600", writingDirection: "ltr" },
  menu: { position: "absolute", left: 12, borderRadius: 14, paddingVertical: 6, minWidth: 180, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 20 },
  menuItem: { paddingHorizontal: 16, paddingVertical: 12 },
  menuText: { fontSize: 16, textAlign: "right" },
  urlBox: { position: "absolute", left: 10, right: 10, borderRadius: 16, padding: 8, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 20, elevation: 18 },
  urlInput: { height: 44, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, textAlign: "left" },
});
