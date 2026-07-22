import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { Search, ArrowLeft, Check, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface ContactListProps {
  isOpen: boolean;
  onClose: () => void;
  isAddingMembers?: boolean;
}

export function ContactList({ isOpen, onClose, isAddingMembers = false }: ContactListProps) {
  const { session } = useAuthStore.getState() as any; // Quick cast since better-auth types might differ
  const { token } = useAuthStore();
  const { chats, activeChatId, setActiveChat, createChat, createGroupChat, addGroupParticipants, onlineUsers } = useChatStore();
  
  const [contacts, setContacts] = useState<any[]>([]);
  const [searchPhone, setSearchPhone] = useState('');
  
  // Group creation states
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groupCreationStep, setGroupCreationStep] = useState(1);
  const [groupParticipants, setGroupParticipants] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadContacts();
      if (isAddingMembers) {
        setGroupParticipants([]);
        setIsCreatingGroup(false);
      }
    }
  }, [isOpen, isAddingMembers]);

  const loadContacts = async () => {
    try {
      const url = `${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/users/contacts`;
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        setContacts(await res.json());
      }
    } catch (err) {
      console.error('Failed to load contacts', err);
    }
  };

  const handleStartChat = async (contactId: string) => {
    if (isCreatingGroup || isAddingMembers) {
      if (groupParticipants.includes(contactId)) {
        setGroupParticipants(prev => prev.filter(id => id !== contactId));
      } else {
        setGroupParticipants(prev => [...prev, contactId]);
      }
      return;
    }
    const chatId = await createChat(contactId, token || 'better-auth-session');
    if (chatId) {
      setActiveChat(chatId);
      onClose();
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || groupParticipants.length === 0) return;
    const chatId = await createGroupChat(groupName, groupParticipants);
    if (chatId) {
      setActiveChat(chatId);
      onClose();
      setIsCreatingGroup(false);
      setGroupParticipants([]);
      setGroupName('');
    }
  };

  const handleAddMembersSubmit = async () => {
    if (activeChatId && groupParticipants.length > 0) {
      await addGroupParticipants(activeChatId, groupParticipants);
      setGroupParticipants([]);
      onClose();
    }
  };

  const activeChat = activeChatId ? chats.find(c => c.id === activeChatId) : null;
  const existingIds = activeChat?.participants?.map((p: any) => p.userId) || [];

  const filteredContacts = contacts.filter(c => {
    if (isAddingMembers && existingIds.includes(c.id)) return false;
    return !searchPhone || (c.name && c.name.toLowerCase().includes(searchPhone.toLowerCase())) || (c.phoneNumber && c.phoneNumber.includes(searchPhone));
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="absolute top-0 left-0 w-full md:w-[30%] md:min-w-[350px] max-w-full md:max-w-[450px] h-full bg-surface z-30 flex flex-col shadow-2xl border-r border-surface-border"
        >
          {/* Header */}
          <div className="h-24 bg-surface-hover flex items-end px-4 pb-4 shrink-0">
            <button 
              onClick={() => {
                if (isCreatingGroup) {
                  if (groupCreationStep === 2) setGroupCreationStep(1);
                  else { setIsCreatingGroup(false); setGroupParticipants([]); }
                } else {
                  onClose();
                }
              }} 
              className="text-text-primary mr-6 hover:text-primary transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-xl font-medium text-text-primary">
              {isCreatingGroup && groupCreationStep === 1 ? 'Add group participants' : 
               isCreatingGroup && groupCreationStep === 2 ? 'New group' : 
               isAddingMembers ? 'Add members' : 'New chat'}
            </h1>
          </div>
          
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-surface-border flex flex-col relative">
            
            {/* Step 2: Group Info */}
            {isCreatingGroup && groupCreationStep === 2 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center p-8 bg-surface">
                <div className="w-32 h-32 bg-surface-hover rounded-full flex items-center justify-center mb-8 border border-dashed border-text-tertiary">
                  <span className="text-text-tertiary text-sm">Add Icon</span>
                </div>
                <Input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Group Subject"
                  className="mb-8"
                  autoFocus
                />
                <p className="text-text-secondary text-sm self-start mb-4">Participants: {groupParticipants.length}</p>
              </motion.div>
            )}

            {/* Step 1: Contacts List */}
            {(!isCreatingGroup || groupCreationStep === 1) && (
              <>
                <div className="p-3 border-b border-surface-border">
                  <Input 
                    icon={<Search size={18} />}
                    value={searchPhone}
                    onChange={(e) => setSearchPhone(e.target.value)}
                    placeholder="Search contacts"
                    className="bg-surface-hover border-none"
                  />
                </div>
              
                {!isCreatingGroup && !isAddingMembers && (
                  <div 
                    onClick={() => { setIsCreatingGroup(true); setGroupCreationStep(1); }} 
                    className="flex items-center px-4 py-3 cursor-pointer hover:bg-surface-hover border-b border-surface-border transition-colors"
                  >
                    <div className="w-12 h-12 bg-primary rounded-full mr-4 flex items-center justify-center text-white">
                      <Users size={24} />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-base font-medium text-text-primary">New group</h2>
                    </div>
                  </div>
                )}

                {filteredContacts.map(contact => {
                  const isOnline = onlineUsers[contact.id] || false;
                  return (
                  <div 
                    key={contact.id} 
                    onClick={() => handleStartChat(contact.id)} 
                    className="flex items-center px-4 py-3 cursor-pointer hover:bg-surface-hover border-b border-surface-border/50 transition-colors"
                  >
                    {(isCreatingGroup || isAddingMembers) && (
                      <div className="mr-4">
                        <div className={cn(
                          "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                          groupParticipants.includes(contact.id) ? "bg-primary border-primary" : "border-text-secondary"
                        )}>
                          {groupParticipants.includes(contact.id) && <Check size={14} className="text-white" />}
                        </div>
                      </div>
                    )}
                    <div className="relative mr-4 shrink-0">
                      <Avatar src={contact.profilePicture} fallback={contact.name || contact.phoneNumber} size="lg" />
                      {isOnline && (
                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#25D366] rounded-full border-2 border-surface z-10" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base text-text-primary font-medium truncate">{contact.name || contact.phoneNumber}</h2>
                      {contact.about && <p className="text-sm text-text-secondary truncate">{contact.about}</p>}
                    </div>
                  </div>
                )})}
              </>
            )}

            {/* FAB / Action Buttons */}
            {isCreatingGroup && groupCreationStep === 1 && groupParticipants.length > 0 && (
              <div className="sticky bottom-0 p-4 bg-surface/80 backdrop-blur-md flex justify-center mt-auto border-t border-surface-border">
                <Button size="icon" onClick={() => setGroupCreationStep(2)} className="h-14 w-14 rounded-full text-white bg-primary">
                  <ArrowLeft size={24} className="rotate-180" />
                </Button>
              </div>
            )}

            {isCreatingGroup && groupCreationStep === 2 && (
              <div className="sticky bottom-0 p-4 bg-surface/80 backdrop-blur-md flex justify-center mt-auto border-t border-surface-border">
                <Button size="icon" onClick={handleCreateGroup} disabled={!groupName.trim()} className="h-14 w-14 rounded-full text-white bg-primary">
                  <Check size={24} strokeWidth={3} />
                </Button>
              </div>
            )}

            {isAddingMembers && (
              <div className="sticky bottom-0 p-4 bg-surface/80 backdrop-blur-md flex justify-center mt-auto border-t border-surface-border">
                <Button size="icon" onClick={handleAddMembersSubmit} disabled={groupParticipants.length === 0} className="h-14 w-14 rounded-full text-white bg-primary">
                  <Check size={24} strokeWidth={3} />
                </Button>
              </div>
            )}
            
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
