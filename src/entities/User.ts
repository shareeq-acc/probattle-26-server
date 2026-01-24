import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from "typeorm";
import { Service } from "./Service";
import { Booking } from "./Booking";

export enum UserRole {
  PROVIDER = 'provider',
  SEEKER = 'seeker',
  BOTH = 'both'
}

@Entity()
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ type: "text", nullable: true })
  bio: string;

  @Column({
    type: "simple-enum",
    enum: UserRole,
    default: UserRole.SEEKER
  })
  role: UserRole;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Service, service => service.provider)
  services: Service[];

  @OneToMany(() => Booking, booking => booking.seeker)
  bookingsAsSeeker: Booking[];

  @OneToMany(() => Booking, booking => booking.provider)
  bookingsAsProvider: Booking[];
}
