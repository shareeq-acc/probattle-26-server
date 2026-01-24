import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { Service } from "./Service";
import { User } from "./User";

export enum BookingStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

@Entity()
export class Booking {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  serviceId: string;

  @ManyToOne(() => Service, service => service.bookings)
  @JoinColumn({ name: "serviceId" })
  service: Service;

  @Column()
  seekerId: string;

  @ManyToOne(() => User, user => user.bookingsAsSeeker)
  @JoinColumn({ name: "seekerId" })
  seeker: User;

  @Column()
  providerId: string;

  @ManyToOne(() => User, user => user.bookingsAsProvider)
  @JoinColumn({ name: "providerId" })
  provider: User;

  @Column("date")
  requestedDate: string;

  @Column()
  requestedTime: string;

  @Column("decimal", { precision: 10, scale: 2 })
  duration: number;

  @Column({
    type: "simple-enum",
    enum: BookingStatus,
    default: BookingStatus.PENDING
  })
  status: BookingStatus;

  @Column("decimal", { precision: 10, scale: 2 })
  totalPrice: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
