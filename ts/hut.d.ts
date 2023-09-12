type FormProto = {
  init: (args: any) => void
};
type FormSupers = { [key: string]: Form_cnst<FormSupers, any> };
type Form_cnst<Supers extends FormSupers = {}, Props extends FormProto = FormProto> = {
  new (): Form_inst<Supers, Props>;
  (): Form_inst<Supers, Props>;
} | MapConstructor | SetConstructor | StringConstructor | NumberConstructor | BooleanConstructor;
type Form_inst<Supers extends FormSupers = {}, Props extends FormProto = FormProto> = {
  [key in keyof Props]: Props[key];
};

// global.form
type FormFn_config<Supers extends { [key: string]: Form_cnst<Supers, Props> }, Props extends FormProto> = {
  name: string,
  has?: FormSupers,
  props: (
    forms: { [S in keyof Supers]: { [K in keyof Supers[S]]: Supers[S][K] extends Form_cnst<any, infer SProps> ? SProps : never } },
    Form: Form_cnst<Supers, Props>
  ) => Form_inst<Supers, Props>
};
declare const form: <Supers extends FormSupers, Props extends FormProto>(config: FormFn_config<Supers, Props>) => Form_cnst<Supers, Props>;

// global.Endable
type Endable_props = {
  init: (fn?: () => void) => void;
  onn: () => boolean;
  off: () => boolean;
  end: () => boolean;
}
declare const Endable: Form_cnst<{}, Endable_props>;

// global.getForm
declare const getForm: <Supers extends FormSupers, Props extends FormProto>(item: Form_inst<Supers, Props>) => Form_cnst<Supers, Props>;

// global.getFormName
declare const getFormName: (item: any) => string;

// global.isForm
declare const isForm: (inst: any, form: Form_cnst) => boolean;

// global.denumerate
declare const denumerate: (inst: Form_inst, prop: string) => void;

// global.getMs
declare const getMs: () => number;

declare type Room_setup_hut = {
  Hut: Form_cnst<{ Record }, {
    init: (props: any) => void;
  }>
};
declare type Room_record = {
  Record: Form_cnst<{}, {
    init: (props: any) => void
  }>
};
type Room_mapping = {
  'setup.hut': Room_setup_hut,
  'record': Room_record,
};
declare const rooms: {
  [key in keyof Room_mapping]: () => Promise<Room_mapping[key]>
};

declare const global: {
  rooms: typeof rooms
};

// global.getRoom
type Room = any;
declare const getRoom: {
  <RoomName extends keyof Room_mapping>(name: RoomName): Promise<Room_mapping[RoomName]>
};

// global.getRooms

declare const getRooms: <RoomNames extends keyof Room_mapping>(rooms: RoomNames[]) => Promise<{
  [RoomName in RoomNames]: Room_mapping[RoomName]
}>;