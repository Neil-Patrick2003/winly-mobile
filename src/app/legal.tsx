import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { fetchLegalDocuments, type LegalBlock, type LegalDocument } from '@/lib/legal';
import { goBack } from '@/lib/navigation';

/**
 * The Terms of Service and the Privacy Policy, on one screen.
 *
 * A screen rather than a link out to a browser: somebody halfway through
 * signing up should be able to read what they are agreeing to and come back
 * with the form still filled in, which handing them to Safari does not give
 * them.
 *
 * The wording is fetched rather than bundled, so it stays the same wording the
 * public pages serve — the ones App Store Connect is given. Both are rendered
 * from the same structure on the server.
 */
export default function LegalScreen() {
  const insets = useSafeAreaInsets();
  /** `terms` or `privacy` — which document to open at, when asked for one. */
  const { document: requested } = useLocalSearchParams<{ document?: string }>();

  const [documents, setDocuments] = useState<LegalDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Bumped to ask again; the fetch effect runs off it. */
  const [attempt, setAttempt] = useState(0);

  const scroller = useRef<ScrollView>(null);
  /** Where each document begins, measured as it lays out. */
  const offsets = useRef<Record<string, number>>({});
  const jumped = useRef(false);

  useEffect(() => {
    let cancelled = false;

    fetchLegalDocuments()
      .then((loaded) => {
        if (cancelled) return;
        setDocuments(loaded);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setDocuments(null);
        setError(
          caught instanceof Error ? caught.message : 'Could not load these documents right now.'
        );
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  /** Ask again after a failure. A new attempt re-runs the effect above. */
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  /*
   * Jump to the requested document once its position is known.
   *
   * Guarded by a ref so it happens once: layout fires again on rotation and on
   * re-measure, and scrolling somebody back to the top of the terms while they
   * are reading the privacy policy would be its own kind of rude.
   */
  const jumpIfReady = (key: string) => {
    if (jumped.current || !requested || requested !== key) return;
    const offset = offsets.current[key];
    if (offset === undefined) return;

    jumped.current = true;
    // Not animated: this is where the screen should have opened, so sliding
    // there afterwards reads as the screen moving on its own.
    scroller.current?.scrollTo({ y: Math.max(0, offset - 8), animated: false });
  };

  return (
    <View className="flex-1 bg-surface">
      <View
        className="flex-row items-center gap-1 border-b border-hairline px-2 pb-2"
        style={{ paddingTop: insets.top + 6 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => goBack('/register')}
          hitSlop={6}
          className="p-2 active:opacity-60">
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            size={18}
            tintColor={Colors.light.text}
          />
        </Pressable>
        <Text className="font-body-semibold text-base leading-6 text-ink">Terms &amp; Privacy</Text>
      </View>

      {documents === null ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          {error ? (
            <>
              <Text className="text-center font-sans text-sm leading-5 text-ink-muted">
                {error}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={retry}
                className="rounded-full bg-primary px-5 py-2.5 active:opacity-85">
                <Text className="font-body-semibold text-sm leading-5 text-white">Try again</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator size="small" color={Colors.light.primary} />
          )}
        </View>
      ) : (
        <ScrollView
          ref={scroller}
          className="flex-1"
          contentContainerClassName="w-full max-w-[800px] self-center px-5"
          contentContainerStyle={{ paddingTop: 20, paddingBottom: insets.bottom + 48 }}>
          {documents.map((document, index) => (
            <View
              key={document.key}
              onLayout={(event) => {
                offsets.current[document.key] = event.nativeEvent.layout.y;
                jumpIfReady(document.key);
              }}
              className={index === 0 ? '' : 'mt-10 border-t border-hairline pt-10'}>
              <Text className="font-heading-bold text-2xl leading-8 text-ink">
                {document.title}
              </Text>
              <Text className="pt-1 font-sans text-xs leading-4 text-ink-muted">
                Last updated {document.updated_at}
              </Text>

              {document.sections.map((section) => (
                <View key={section.heading} className="pt-7">
                  <Text className="font-body-semibold text-base leading-6 text-ink">
                    {section.heading}
                  </Text>
                  {section.blocks.map((block, blockIndex) => (
                    <Block key={blockIndex} block={block} />
                  ))}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/** One run of content. Unknown types render nothing rather than throwing. */
function Block({ block }: { block: LegalBlock }) {
  if (block.type === 'p') {
    return (
      <Text className="pt-2.5 font-sans text-sm leading-[22px] text-ink-muted">{block.text}</Text>
    );
  }

  if (block.type === 'ul') {
    return (
      <View className="gap-1.5 pt-2.5">
        {block.items.map((item, index) => (
          <View key={index} className="flex-row gap-2 pl-1">
            <Text className="font-sans text-sm leading-[22px] text-ink-muted">•</Text>
            <Text className="flex-1 font-sans text-sm leading-[22px] text-ink-muted">{item}</Text>
          </View>
        ))}
      </View>
    );
  }

  if (block.type === 'callout') {
    return (
      <View
        className="mt-3 gap-2 rounded-xl border-l-[3px] bg-surface-card p-4"
        style={{ borderLeftColor: Colors.light.primary }}>
        {block.text.map((paragraph, index) => (
          <Text
            key={index}
            className={`font-sans text-sm leading-[22px] ${
              // The first line is the point of the callout; the rest explain it.
              index === 0 ? 'font-body-semibold text-ink' : 'text-ink-muted'
            }`}>
            {paragraph}
          </Text>
        ))}
      </View>
    );
  }

  return null;
}
