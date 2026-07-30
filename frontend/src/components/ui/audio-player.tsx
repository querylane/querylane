import {
  LoaderCircle,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  type SyntheticEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const DEFAULT_DURATION = 0;
const DEFAULT_VOLUME = 1;

function normalizeMediaTime(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

function formatMediaTime(value: number): string {
  const wholeSeconds = Math.floor(normalizeMediaTime(value));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function AudioPlayer({
  label,
  mimeType,
  src,
}: {
  label: string;
  mimeType: string;
  src: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);

  useEffect(
    function synchronizePlayingTime() {
      if (!isPlaying) {
        return;
      }
      let animationFrame = 0;
      function updatePlayingTime() {
        const audio = audioRef.current;
        if (audio) {
          setCurrentTime(normalizeMediaTime(audio.currentTime));
        }
        animationFrame = requestAnimationFrame(updatePlayingTime);
      }
      animationFrame = requestAnimationFrame(updatePlayingTime);
      return () => cancelAnimationFrame(animationFrame);
    },
    [isPlaying]
  );

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    setPlaybackError("");
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      setIsPlaying(false);
      setIsBuffering(false);
      setPlaybackError(
        `Couldn’t play ${label}. Download the value instead.`
      );
    }
  }

  function updateDuration(event: SyntheticEvent<HTMLAudioElement>) {
    const audio = event.currentTarget;
    setDuration(normalizeMediaTime(audio.duration));
    setCurrentTime(normalizeMediaTime(audio.currentTime));
    setPlaybackError("");
  }

  function seek(nextTime: number) {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function toggleMute() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.muted = !audio.muted;
    setIsMuted(audio.muted);
  }

  function changeVolume(nextVolume: number) {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.volume = nextVolume;
    if (nextVolume > 0 && audio.muted) {
      audio.muted = false;
      setIsMuted(false);
    }
    setVolume(nextVolume);
  }

  function changePlaybackRate(value: unknown) {
    const nextRate = Number(value);
    if (!PLAYBACK_RATES.some((rate) => rate === nextRate)) {
      return;
    }
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  }

  function showPlaybackError() {
    setIsPlaying(false);
    setIsBuffering(false);
    setPlaybackError(`Couldn’t play ${label}. Download the value instead.`);
  }

  function beginPlayback(event: SyntheticEvent<HTMLAudioElement>) {
    const playingAudio = event.currentTarget;
    for (const audio of document.querySelectorAll<HTMLAudioElement>(
      '[data-slot="audio-player-engine"]'
    )) {
      if (audio !== playingAudio) {
        audio.pause();
      }
    }
    setIsPlaying(true);
  }

  const playableDuration = duration > 0 ? duration : 1;

  return (
    <section
      aria-label={`${label} audio preview`}
      className="w-full rounded-md border bg-muted/30 p-2"
    >
      <audio
        aria-hidden="true"
        className="hidden"
        data-slot="audio-player-engine"
        key={src}
        onCanPlay={() => setIsBuffering(false)}
        onDurationChange={updateDuration}
        onEnded={() => setIsPlaying(false)}
        onError={showPlaybackError}
        onLoadedMetadata={updateDuration}
        onPause={() => setIsPlaying(false)}
        onPlay={beginPlayback}
        onPlaying={() => setIsBuffering(false)}
        onTimeUpdate={(event) =>
          setCurrentTime(normalizeMediaTime(event.currentTarget.currentTime))
        }
        onVolumeChange={(event) => {
          setIsMuted(event.currentTarget.muted);
          setVolume(event.currentTarget.volume);
        }}
        onWaiting={() => setIsBuffering(true)}
        preload="metadata"
        ref={audioRef}
      >
        <source src={src} type={mimeType} />
      </audio>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          aria-label={`${isPlaying ? "Pause" : "Play"} ${label}`}
          className="size-11 rounded-full"
          onClick={togglePlayback}
          size="icon"
          type="button"
        >
          {isPlaying ? <Pause /> : <Play />}
        </Button>
        <div className="flex min-w-48 flex-1 items-center gap-2">
          <time className="w-9 text-right font-mono text-muted-foreground text-xs tabular-nums">
            {formatMediaTime(currentTime)}
          </time>
          <Slider
            aria-label={`Seek ${label}`}
            aria-valuetext={`${formatMediaTime(currentTime)} of ${formatMediaTime(duration)}`}
            className="min-w-24 flex-1"
            disabled={duration <= 0}
            max={playableDuration}
            onValueChange={seek}
            step={0.01}
            value={Math.min(currentTime, playableDuration)}
          />
          <time className="w-9 font-mono text-muted-foreground text-xs tabular-nums">
            {formatMediaTime(duration)}
          </time>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={`Playback speed, ${playbackRate}×`}
                className="h-11 min-w-11 px-2 font-mono text-xs"
                type="button"
                variant="ghost"
              >
                {playbackRate}×
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-24">
            <DropdownMenuRadioGroup
              onValueChange={changePlaybackRate}
              value={String(playbackRate)}
            >
              {PLAYBACK_RATES.map((rate) => (
                <DropdownMenuRadioItem
                  closeOnClick={true}
                  key={rate}
                  value={String(rate)}
                >
                  {rate}×
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center gap-1">
          <Button
            aria-label={`${isMuted ? "Unmute" : "Mute"} ${label}`}
            className="size-11"
            onClick={toggleMute}
            size="icon"
            type="button"
            variant="ghost"
          >
            {isMuted ? <VolumeX /> : <Volume2 />}
          </Button>
          <Slider
            aria-label={`${label} volume`}
            aria-valuetext={
              isMuted ? "Muted" : `${Math.round(volume * 100)}%`
            }
            className="w-20 flex-none"
            max={1}
            onValueChange={changeVolume}
            step={0.01}
            value={volume}
          />
        </div>
      </div>
      {isBuffering ? (
        <span
          className="mt-1 flex items-center gap-1 text-muted-foreground text-xs"
          role="status"
        >
          <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />
          Buffering {label}
        </span>
      ) : null}
      {playbackError ? (
        <p className="mt-1 text-destructive-foreground text-xs" role="alert">
          {playbackError}
        </p>
      ) : null}
    </section>
  );
}

export { AudioPlayer };
