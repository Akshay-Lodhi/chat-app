import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-surface-border/50", className)}
      {...props}
    />
  );
}

export { Skeleton };

export function ChatListSkeleton() {
  return (
    <div className="flex flex-col space-y-4 p-4 h-full w-full">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex items-center space-x-4 w-full">
          <Skeleton className="h-12 w-12 rounded-full shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-[60%]" />
            <Skeleton className="h-3 w-[40%]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MessageSkeleton({ isMine = false }: { isMine?: boolean }) {
  return (
    <div className={`flex w-full ${isMine ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`flex flex-col space-y-2 max-w-[70%] ${isMine ? 'items-end' : 'items-start'}`}>
        <Skeleton className={`h-12 rounded-2xl ${isMine ? 'rounded-tr-none w-48' : 'rounded-tl-none w-64'}`} />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

export function MessageListSkeleton() {
  return (
    <div className="flex flex-col p-4 w-full h-full justify-end space-y-4 overflow-hidden">
      <MessageSkeleton isMine={false} />
      <MessageSkeleton isMine={true} />
      <MessageSkeleton isMine={false} />
      <MessageSkeleton isMine={false} />
      <MessageSkeleton isMine={true} />
      <MessageSkeleton isMine={true} />
    </div>
  );
}
