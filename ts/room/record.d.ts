declare namespace HutRoom_record {
  export type Record = Form_cnst<{}, {
    init: (props: any) => void
  }>;
  
  export type Room = {
    Record: Record
  };
}