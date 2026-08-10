import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ImageWithPlaceholder } from '@/components/ui/image';
import { Lightbox } from '@/components/ui/lightbox';

/**
 * The photo at the top of a profile, and the way to see it properly.
 *
 * A profile picture is drawn at 96 points and cropped to a circle everywhere it
 * appears, which is the one place in the app where what is shown is reliably
 * less than what was uploaded — so this is where opening it full screen earns
 * its keep. The viewer draws it uncropped, at whatever shape it really is.
 *
 * Nothing is offered on an account that has never set one. The initial is a
 * stand-in for a photo rather than a small version of one, and a full-screen
 * letter would be a joke at the expense of whoever tapped it.
 *
 * Shared by both profile screens so a photo cannot be openable on your own page
 * and inert on somebody else's. The ring and its `bg-surface` belong here too:
 * it is what makes the avatar read as sitting on the cover rather than punched
 * out of it, and the two screens had drifted apart on it before.
 */
export function ProfileAvatar({
  uri,
  name,
  initial,
}: {
  uri: string | null | undefined;
  /** Whose it is, for the label and the viewer's title. */
  name: string;
  /** The letter to fall back to. Worked out by the screen, which knows what it has. */
  initial: string;
}) {
  const [viewing, setViewing] = useState(false);

  const photo = (
    <View className="rounded-full bg-surface p-1">
      <ImageWithPlaceholder
        source={{ uri: uri ?? null }}
        className="h-24 w-24 rounded-full"
        accessibilityLabel={`${name} profile photo`}>
        <View className="h-24 w-24 items-center justify-center rounded-full bg-primary">
          <Text className="font-heading-bold text-4xl leading-[44px] text-white">{initial}</Text>
        </View>
      </ImageWithPlaceholder>
    </View>
  );

  if (!uri) return photo;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${name}'s profile photo full screen`}
        onPress={() => setViewing(true)}
        className="active:opacity-80">
        {photo}
      </Pressable>

      {viewing ? (
        <Lightbox
          // A profile photo has no id of its own — there is only ever the one,
          // and the list it is handed as needs a key rather than a record.
          items={[{ id: 'avatar', url: uri, label: `${name} profile photo` }]}
          title={name}
          onClose={() => setViewing(false)}
        />
      ) : null}
    </>
  );
}
