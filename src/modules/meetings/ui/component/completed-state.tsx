import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MeetingGetOne } from "../../types";

import Link from "next/link";
import Markdown from "react-markdown";
import {
  BookOpenTextIcon,
  SparklesIcon,
  FileTextIcon,
  FileVideo2Icon,
  ClockFadingIcon,
} from "lucide-react";
import { GeneratedAvatar } from "@/components/generated-avatar";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/utils";
import { Transcript } from "./transcript";
import { ChatProvider } from "./chat-provider";

interface Props {
  data: MeetingGetOne;
}

export const CompletedState = ({ data }: Props) => {
  return (
    <div className="flex flex-col gap-y-4">
      <Tabs defaultValue="summary">
        <div className="bg-white rounded-lg border px-3">
          <ScrollArea>
            <TabsList className="p-0 bg-background justify-start rounded-none h-13">
              <TabsTrigger
                value="summary"
                className="text-muted-foreground rounded-none bg-background data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-b-primary data-[state=active]:text-accent-foreground h-full hover:text-accent-foreground"
              >
                <BookOpenTextIcon />
                Summary
              </TabsTrigger>
              <TabsTrigger
                value="transcript"
                className="text-muted-foreground rounded-none bg-background data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-b-primary data-[state=active]:text-accent-foreground h-full hover:text-accent-foreground"
              >
                <FileTextIcon />
                Transcript
              </TabsTrigger>
              <TabsTrigger
                value="recording"
                className="text-muted-foreground rounded-none bg-background data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-b-primary data-[state=active]:text-accent-foreground h-full hover:text-accent-foreground"
              >
                <FileVideo2Icon />
                Recording
              </TabsTrigger>
              <TabsTrigger
                value="chat"
                className="text-muted-foreground rounded-none bg-background data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-b-primary data-[state=active]:text-accent-foreground h-full hover:text-accent-foreground"
              >
                <SparklesIcon />
                Ask AI
              </TabsTrigger>
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
        <TabsContent value="chat">
          <ChatProvider meetingId={data.id} meetingName={data.name} />
        </TabsContent>
        <TabsContent value="transcript">
          <Transcript meetingId={data.id} />
        </TabsContent>
        <TabsContent value="recording">
          <div className="bg-white rounded-lg border px-4 py-5">
            <video
              src={data.recordingUrl!}
              className="w-full rounded-lg"
              controls
            />
          </div>
        </TabsContent>
        <TabsContent value="summary">
            <div className="bg-white rounded-lg border">
                <div className="px-4 py-5 gap-y-5 flex flex-col col-span-5">
                    <h2 className="text-2xl font-medium capitalize">{data.name}</h2>
                    <div className="flex gap-x-2 items-center">
                        <Link 
                            href={`/agents/${data.agent.id}`}
                            className="flex items-center gap-x-2 underline underline-offset-4 capitalize"
                        >
                            <GeneratedAvatar
                              variant="botttsNeutral"
                              seed={data.agent.id}
                              className="size-5"
                            />
                            <p>{data.agent.name}</p>
                        </Link>{" "}
                        <p>{data.startedAt ? format(data.startedAt, "PPP"): ""}</p>
                    </div>
                    <div className="flex gap-x-2 items-center">
                        <SparklesIcon />
                        <p>General Summary</p>
                    </div>
                    <Badge
                        variant="outline"
                        className="flex items-center gap-x-2 [&>svg]:size-4"
                    >
                        <ClockFadingIcon className="text-blue-700" />
                        {data.duration? formatDuration(data.duration): "No duration"}
                    </Badge>
                    <div>
                        <Markdown components={{
                            h1: (props) => (
                                <h1 className="text-2xl font-medium mb-6" {...props} />
                            ),
                            h2: (props) => (
                                <h2 className="text-xl font-medium mb-6" {...props} />
                            ),
                            h3: (props) => (
                                <h3 className="text-lg font-medium mb-6" {...props} />
                            ),
                            h4: (props) => (
                                <h4 className="text-md font-medium mb-6" {...props} />
                            ),
                            h5: (props) => (
                                <h5 className="text-sm font-medium mb-6" {...props} />
                            ),
                            h6: (props) => (
                                <h6 className="text-xs font-medium mb-6" {...props} />
                            ),
                            p: (props) => (
                                <p className="mb-6 leading-relaxed" {...props} />
                            ),
                            ul: (props) => (
                                <ul className="mb-6 list-disc list-inside" {...props} />
                            ),
                            ol: (props) => (
                                <ol className="mb-6 list-decimal list-inside" {...props} />
                            ),
                            li: (props) => (
                                <li className="mb-1" {...props} />
                            ),
                            a: (props) => (
                                <a className="underline underline-offset-4" {...props} />
                            ),
                            strong: (props) => (
                                <strong className="font-semibold" {...props} />
                            ),
                            em: (props) => (
                                <em className="italic" {...props} />
                            ),
                            code: (props) => (
                                <code className="bg-gray-100 py-0.5 px-1 rounded" {...props} />
                            ),
                            blockquote: (props) => (
                                <blockquote className="border-l-4 pl-4 italic my-4" {...props} />
                            ),
                            hr: (props) => (
                                <hr className="my-6" {...props} />
                            ),
                            table: (props) => (
                                <table className="mb-6" {...props} />
                            ),
                            thead: (props) => (
                                <thead className="text-left" {...props} />
                            ),
                            tbody: (props) => (
                                <tbody {...props} />
                            ),
                            tr: (props) => (
                                <tr {...props} />
                            ),
                            td: (props) => (
                                <td className="p-2" {...props} />
                            ),
                            th: (props) => (
                                <th className="p-2" {...props} />
                            )
                        }} >{data.summary}</Markdown>
                    </div>
                </div>
            </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
