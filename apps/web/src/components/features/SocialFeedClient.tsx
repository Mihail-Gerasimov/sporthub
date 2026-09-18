'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { Button, Card } from '@/components/ui';
import { FeatureError, FeatureShell, HonestEmptyState } from '@/components/features/FeatureShell';
import { clientApi } from '@/lib/client-api';
import { useAuthStore } from '@/stores/useAuthStore';

type SocialPost = {
  id: number;
  authorId: number;
  author?: { name: string; avatarUrl?: string | null };
  body: string;
  imageUrl?: string | null;
  createdAt: string;
  reactionCount?: number;
  commentCount?: number;
};

type Page = { items: SocialPost[]; total: number };

export function SocialFeedClient() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    try {
      setError('');
      const page = await clientApi<Page>('/api/social/posts?limit=30');
      setPosts(page.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить ленту');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    try {
      setSubmitting(true);
      const post = await clientApi<SocialPost>('/api/social/posts', {
        method: 'POST',
        body: JSON.stringify({ body, visibility: 'public' }),
      });
      setPosts((current) => [post, ...current]);
      setBody('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось опубликовать запись');
    } finally {
      setSubmitting(false);
    }
  }

  async function react(postId: number) {
    try {
      await clientApi(`/api/social/posts/${postId}/reaction`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'support' }),
      });
      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? { ...post, reactionCount: (post.reactionCount ?? 0) + 1 }
            : post,
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось поддержать публикацию');
    }
  }

  return (
    <FeatureShell
      eyebrow="Живая лента"
      title="Люди спорта"
      description="Результаты, тренировки и новости публикуют реальные участники платформы. Пустая лента означает, что публикаций пока нет."
    >
      <div className="mx-auto grid max-w-4xl gap-5">
        {isAuthenticated ? (
          <Card>
            <form onSubmit={publish} className="flex flex-col gap-3">
              <label htmlFor="social-post-body" className="font-body text-sm font-semibold text-ink">
                Новая публикация
              </label>
              <textarea
                id="social-post-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={5000}
                placeholder="Поделитесь тренировкой, результатом или новостью"
                className="min-h-28 resize-y rounded-card-lg border border-line bg-card-2 p-4 font-body text-sm text-ink outline-none transition focus:border-lime focus:ring-4 focus:ring-lime/15"
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" loading={submitting} disabled={!body.trim()}>
                  Опубликовать
                </Button>
              </div>
            </form>
          </Card>
        ) : null}

        {error ? <FeatureError message={error} /> : null}
        {!isAuthenticated ? (
          <HonestEmptyState
            title="Войдите, чтобы открыть ленту"
            description="Лента учитывает подписки и приватность публикаций, поэтому загружается только для авторизованного человека."
          />
        ) : loading ? (
          <Card className="animate-pulse text-sm text-muted">Загружаем публикации…</Card>
        ) : posts.length === 0 ? (
          <HonestEmptyState
            title="Публикаций пока нет"
            description="Станьте первым участником, который поделится настоящим спортивным результатом."
          />
        ) : (
          posts.map((post) => (
            <Card key={post.id} className="overflow-hidden p-0">
              <div className="flex items-center gap-3 border-b border-line px-5 py-4">
                <div className="flex size-10 items-center justify-center rounded-pill bg-lime-soft font-display text-sm font-black text-lime-hov">
                  {(post.author?.name ?? `#${post.authorId}`).slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-body text-sm font-bold text-ink">
                    {post.author?.name ?? `Участник #${post.authorId}`}
                  </p>
                  <time className="font-mono text-[11px] text-muted">
                    {new Date(post.createdAt).toLocaleString('ru-RU')}
                  </time>
                </div>
              </div>
              {post.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- адрес опубликованного медиа приходит из API
                <img src={post.imageUrl} alt="" className="max-h-[560px] w-full object-cover" />
              ) : null}
              <p className="whitespace-pre-wrap px-5 py-4 font-body text-sm leading-relaxed text-ink">
                {post.body}
              </p>
              <div className="flex items-center gap-4 border-t border-line px-5 py-3">
                <button
                  type="button"
                  onClick={() => void react(post.id)}
                  className="font-body text-xs font-bold uppercase tracking-wide text-muted hover:text-lime-hov"
                >
                  Поддержать · {post.reactionCount ?? 0}
                </button>
                <span className="font-body text-xs text-muted">
                  Комментарии · {post.commentCount ?? 0}
                </span>
              </div>
            </Card>
          ))
        )}
      </div>
    </FeatureShell>
  );
}
