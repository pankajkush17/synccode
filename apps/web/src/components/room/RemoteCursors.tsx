'use client'

import { usePresenceStore } from '@/stores/presenceStore'
import { softColor } from '@/util/colorHash'

/** CSS string literal with everything that could end the string escaped. */
function cssString(value: string): string {
  return `"${value.replace(/[^a-zA-Z0-9 _.-]/g, (ch) => `\\${ch.codePointAt(0)!.toString(16)} `)}"`
}

/**
 * Colours and labels the remote cursors. y-monaco places a decoration per peer
 * (classes `yRemoteSelection-<id>` / `yRemoteSelectionHead-<id>`) and keeps it
 * anchored through concurrent edits; this component supplies each peer's
 * colour and name flag as a small generated stylesheet.
 */
export function RemoteCursors() {
  const peers = usePresenceStore((s) => s.peers)

  const css = peers
    .filter((peer) => !peer.isSelf)
    .map(
      (peer) => `
.yRemoteSelection-${peer.clientId} { background-color: ${softColor(peer.color)}; }
.yRemoteSelectionHead-${peer.clientId} { color: ${peer.color}; }
.yRemoteSelectionHead-${peer.clientId}::after { content: ${cssString(peer.name)}; background-color: ${peer.color}; }`,
    )
    .join('\n')

  // biome-ignore lint/security/noDangerouslySetInnerHtml: generated CSS; names are escaped and colours validated upstream
  return <style data-testid="remote-cursor-styles" dangerouslySetInnerHTML={{ __html: css }} />
}
