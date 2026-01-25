import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./User";

@Entity("messages")
@Index(["senderId", "receiverId"])
@Index(["conversationId"])
export class Message {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column("uuid")
  senderId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "senderId" })
  sender!: User;

  @Column("uuid")
  receiverId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "receiverId" })
  receiver!: User;

  @Column({ type: "text" })
  message!: string;

  @Column({ nullable: true })
  conversationId?: string;

  @Column({ default: false })
  read!: boolean;

  @Column({ type: "timestamp", nullable: true })
  readAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: "jsonb", nullable: true })
  metadata?: any; // For attachments, reactions, etc.
}
