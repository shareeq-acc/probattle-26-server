import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Unique } from "typeorm";
import { Booking } from "./Booking";
import { User } from "./User";

@Entity()
@Unique(["bookingId"]) // One rating per booking
export class Rating {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  bookingId: string;

  @ManyToOne(() => Booking)
  @JoinColumn({ name: "bookingId" })
  booking: Booking;

  @Column()
  seekerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "seekerId" })
  seeker: User;

  @Column()
  providerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "providerId" })
  provider: User;

  @Column("int")
  score: number; // 1-5 stars

  @Column("text", { nullable: true })
  review: string | null; // Optional review text

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}