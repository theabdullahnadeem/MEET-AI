import { Dispatch, SetStateAction,useState } from "react"
import { CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandResponsiveDialog } from "@/components/ui/command"
import {useRouter} from "next/navigation"
import {useQuery} from "@tanstack/react-query"
import {useTRPC} from "@/trpc/client"
import {GeneratedAvatar} from "@/components/generated-avatar"

interface  Props{
    open:boolean;
    setOpen:Dispatch<SetStateAction<boolean>>
}

export const DashboardCommand = ({open,setOpen}:Props)=>{
    const router = useRouter()
    const [search, setSearch] = useState("")
    const trpc = useTRPC()
    const meetings = useQuery(trpc.meeting.getMany.queryOptions({
        search,
        pageSize: 100
    }));
    const agents = useQuery(trpc.agent.getMany.queryOptions({
        search,
        pageSize: 100
    }));

    return(
        <CommandResponsiveDialog shouldFilter={false} open={open} onOpenChange={setOpen}>
            <CommandInput 
            value={search}
            onValueChange={(value)=> setSearch(value)}
            placeholder="Find a meeting or an Agent" 
            />
            <CommandList>
                <CommandGroup heading="Meetings">
                    <CommandEmpty>
                        <span className="text-muted-foreground text-sm">
                            No meetings found
                        </span>
                    </CommandEmpty>
                    {meetings.data?.items.map((meeting)=>(
                        <CommandItem
                            onSelect={() => {
                                router.push(`/meetings/${meeting.id}`)
                                setOpen(false)
                            }}
                            key={meeting.id}
                        >
                            {meeting.name}
                        </CommandItem>
                    ))}
                </CommandGroup>
                <CommandGroup heading="Agents">
                    <CommandEmpty>
                        <span className="text-muted-foreground text-sm">
                            No agents found
                        </span>
                    </CommandEmpty>
                    {agents.data?.items.map((agent)=>(
                        <CommandItem
                            onSelect={() => {
                                router.push(`/agents/${agent.id}`)
                                setOpen(false)
                            }}
                            key={agent.id}
                        >
                            {agent.name}
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </CommandResponsiveDialog>
    )
}